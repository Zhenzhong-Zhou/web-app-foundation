import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import request from 'supertest';
import type { App } from 'supertest/types';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { auditLog, sessions } from '../src/database/schema';
import {
  body,
  createE2eApp,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

type Agent = ReturnType<typeof request.agent>;

/**
 * Staying signed in (ADR-065): the person's choice at sign-in, and the
 * organization's policy, held by the server on the next request.
 */
describe('Staying signed in (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  beforeAll(async () => {
    app = await createE2eApp();
    db = app.get<Database>(UNSAFE_GLOBAL_DB);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  /** A fresh sign-in as the alpha owner, kept or not. */
  async function signIn(keepSignedIn?: boolean) {
    const agent: Agent = request.agent(app.getHttpServer() as App);
    const response = await agent
      .post('/v1/auth/login')
      .set('X-Requested-With', 'XMLHttpRequest')
      .send({
        email: 'owner@alpha.example.com',
        password: PASSWORD,
        ...(keepSignedIn === undefined ? {} : { keepSignedIn }),
      })
      .expect(200);
    const cookie = String(response.headers['set-cookie'] ?? '');
    return { agent, cookie };
  }

  async function idleLimit(agent: Agent): Promise<number | null> {
    return (
      body<{ idleLimitMs?: number | null }>(
        await agent.get('/v1/auth/me').expect(200),
      ).idleLimitMs ?? null
    );
  }

  /** Makes every session look last used so many minutes ago. */
  async function idleFor(minutes: number) {
    await db
      .update(sessions)
      .set({ lastSeenAt: new Date(Date.now() - minutes * 60_000) });
  }

  it('keeps ticked sign-ins long, unticked ones to the browser', async () => {
    await registerOrganization(app, 'alpha');

    const kept = await signIn();
    expect(kept.cookie).toMatch(/Expires=/i);
    expect(await idleLimit(kept.agent)).toBeNull();

    const notKept = await signIn(false);
    expect(notKept.cookie).not.toMatch(/Expires=/i);
    expect(await idleLimit(notKept.agent)).toBe(2 * 60 * 60_000);
  });

  it('signs out an unkept session after two hours idle', async () => {
    await registerOrganization(app, 'alpha');
    const { agent } = await signIn(false);

    await idleFor(121);
    await agent.get('/v1/auth/me').expect(401);
  });

  it('holds unkept sessions to the policy, not kept ones', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .patch('/v1/organization')
      .send({ idleSignOutMinutes: 15 })
      .expect(204);

    const kept = await signIn();
    const notKept = await signIn(false);
    expect(await idleLimit(notKept.agent)).toBe(15 * 60_000);

    await idleFor(16);
    await notKept.agent.get('/v1/auth/me').expect(401);
    await kept.agent.get('/v1/auth/me').expect(200);
  });

  it('holds everyone to an everyone policy; the bell moves nothing', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .patch('/v1/organization')
      .send({ idleSignOutMinutes: 30, idleSignOutScope: 'everyone' })
      .expect(204);
    const { agent } = await signIn();
    expect(await idleLimit(agent)).toBe(30 * 60_000);

    // The bell's poll is background: it moves no session's last use.
    await idleFor(29);
    await agent
      .get('/v1/notifications/unread-count')
      .set('X-Background', '1')
      .expect(200);
    const rows = await db.select({ at: sessions.lastSeenAt }).from(sessions);
    const latest = Math.max(...rows.map((row) => row.at.getTime()));
    expect(Date.now() - latest).toBeGreaterThan(28 * 60_000);

    await idleFor(31);
    await agent.get('/v1/auth/me').expect(401);
  });

  it('takes only the limits on offer, and audits a change', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .patch('/v1/organization')
      .send({ idleSignOutMinutes: 20 })
      .expect(400);
    await alpha.agent
      .patch('/v1/organization')
      .send({ idleSignOutScope: 'nobody' })
      .expect(400);

    await alpha.agent
      .patch('/v1/organization')
      .send({ idleSignOutMinutes: 60 })
      .expect(204);
    const entries = await db
      .select({ payload: auditLog.payload })
      .from(auditLog)
      .where(eq(auditLog.action, 'organization.updated'));
    const changes = entries.map(
      (entry) =>
        entry.payload as Record<string, { to?: unknown } | undefined> | null,
    );
    expect(
      changes.some((change) => change?.idleSignOutMinutes?.to === 60),
    ).toBe(true);
  });
});
