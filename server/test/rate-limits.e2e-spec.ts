import type { INestApplication } from '@nestjs/common';
import request from 'supertest';

import { LOGIN_ATTEMPT_LIMIT } from '../src/core/auth/login-throttle';
import { limit } from '../src/core/auth/throttle-limits';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  httpServer,
  seedPermissions,
} from './utils/create-test-app';
import { body, PASSWORD } from './utils/fixtures';
import { solidPng } from './utils/images';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

/**
 * RATE_LIMIT_MAX at its default, set before the app's module is imported,
 * which is when the settings it reads at boot are validated. CI's own is
 * far higher, so no test here could reach it.
 */
const MAX = vi.hoisted(() => {
  vi.stubEnv('RATE_LIMIT_MAX', '100');
  return 100;
});

/** The header CLIENT_IP_HEADER names here, as cf-connecting-ip on Render. */
const HEADER = 'x-test-client-ip';

function remaining(res: { headers: Record<string, string> }): number {
  return Number(res.headers['x-ratelimit-remaining']);
}

/**
 * The limits keyed on who is asking (ADR-011, amended for #316): the
 * signed-in person, or signed out, the client's own address. The one spec
 * with the real limiter: every other swaps in unlimitedThrottler.
 *
 * Counters live in the app's memory, so they outlast resetDatabase: each
 * test signs up new people and uses addresses of its own. A person's
 * requests go to GET /v1/auth/me, which has no limit of its own, and so
 * do a stranger's, answered 401 after the throttler has counted them, as
 * H2's probe found.
 */
describe('Rate limits (e2e)', () => {
  let app: INestApplication;
  let signUps = 0;

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );
    await seedPermissions(app);
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await app.close();
  });

  beforeEach(async () => {
    vi.stubEnv('CLIENT_IP_HEADER', HEADER);
    await resetDatabase(app);
  });

  /**
   * An Owner signed in on an agent of their own, from an address of
   * their own: signing up allows five a minute from one address.
   */
  async function signUp(name: string) {
    signUps += 1;
    const agent = authedAgent(app);
    const email = `owner@${name}.example.com`;
    await agent
      .post('/v1/auth/register')
      .set(HEADER, `198.51.100.${signUps}`)
      .send({
        email,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${name} Co`,
      })
      .expect(201);
    return { agent, email };
  }

  /** GET /v1/auth/me from an address, as a person's agent or signed out. */
  function me(address: string, agent = request(httpServer(app))) {
    return agent.get('/v1/auth/me').set(HEADER, address);
  }

  it('keeps an allowance for each person behind one address', async () => {
    const alpha = await signUp('alpha');
    const beta = await signUp('beta');

    for (let i = 0; i < MAX; i++) {
      await me('192.0.2.1', alpha.agent).expect(200);
    }
    await me('192.0.2.1', alpha.agent).expect(429);

    const res = await me('192.0.2.1', beta.agent).expect(200);
    expect(remaining(res)).toBe(MAX - 1);
  });

  it('keeps one allowance for one person on two addresses', async () => {
    const alpha = await signUp('alpha');

    await me('192.0.2.10', alpha.agent).expect(200);
    const res = await me('192.0.2.11', alpha.agent).expect(200);

    expect(remaining(res)).toBe(MAX - 2);
  });

  it('keeps an allowance for each address signed out', async () => {
    for (let i = 0; i < MAX; i++) await me('192.0.2.20').expect(401);
    await me('192.0.2.20').expect(429);

    const res = await me('192.0.2.21').expect(401);
    expect(remaining(res)).toBe(MAX - 1);
  });

  it('ignores the header while the setting is empty', async () => {
    vi.stubEnv('CLIENT_IP_HEADER', '');

    const first = await me('192.0.2.30').expect(401);
    const second = await me('192.0.2.31').expect(401);

    expect(remaining(second)).toBe(remaining(first) - 1);
  });

  it('counts IPv6 addresses by their /64', async () => {
    const first = await me('2001:db8:1:1::1').expect(401);
    const sameNetwork = await me('2001:db8:1:1:ffff::2').expect(401);
    const otherNetwork = await me('2001:db8:1:2::1').expect(401);

    expect(remaining(first)).toBe(MAX - 1);
    expect(remaining(sameNetwork)).toBe(MAX - 2);
    expect(remaining(otherNetwork)).toBe(MAX - 1);
  });

  it("leaves the owner's sign-in open after a stranger's failed ones from another address", async () => {
    const alpha = await signUp('alpha');
    const stranger = authedAgent(app);
    const guess = () =>
      stranger
        .post('/v1/auth/login')
        .set(HEADER, '192.0.2.40')
        .send({ email: alpha.email, password: 'not-the-password-at-all' });

    for (let i = 0; i < LOGIN_ATTEMPT_LIMIT; i++) await guess().expect(401);
    await guess().expect(429);

    await authedAgent(app)
      .post('/v1/auth/login')
      .set(HEADER, '192.0.2.41')
      .send({ email: alpha.email, password: PASSWORD })
      .expect(200);
  });

  it("lets one person load more pictures than the general allowance, up to the pictures' own", async () => {
    const alpha = await signUp('alpha');
    const logo = body<{ file: { id: string } }>(
      await alpha.agent
        .post('/v1/files/logo')
        .attach('file', await solidPng(400, 200), 'logo.png')
        .expect(201),
    ).file;

    const picture = () => alpha.agent.get(`/v1/files/${logo.id}`).expect(200);
    let res = await picture();
    for (let i = 1; i <= MAX; i++) res = await picture();

    expect(res.headers['x-ratelimit-limit']).toBe(String(limit(1000)));
    expect(remaining(res)).toBe(limit(1000) - MAX - 1);
  });

  /**
   * The address the limiter counts is the one recorded: Your devices, the
   * account's history and the new-sign-in email all read these rows.
   */
  it("records a sign-in's address from the header, on the session and its event", async () => {
    const alpha = await signUp('alpha');
    const phone = authedAgent(app);

    await phone
      .post('/v1/auth/login')
      .set(HEADER, '192.0.2.50')
      .send({ email: alpha.email, password: PASSWORD })
      .expect(200);

    const sessions = body<{ current: boolean; ip: string | null }[]>(
      await phone.get('/v1/account/sessions').expect(200),
    );
    expect(sessions.find((session) => session.current)?.ip).toBe('192.0.2.50');

    const events = body<{ action: string; ip: string | null }[]>(
      await phone.get('/v1/account/events').expect(200),
    );
    expect(events.find((event) => event.action === 'session.created')?.ip).toBe(
      '192.0.2.50',
    );
  });
});
