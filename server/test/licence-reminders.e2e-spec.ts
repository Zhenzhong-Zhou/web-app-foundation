import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database } from '../src/database/database.module';
import { UNSAFE_GLOBAL_DB } from '../src/database/database.tokens';
import { organizations } from '../src/database/schema';
import { LicenceRemindersService } from '../src/modules/product-licences/licence-reminders.service';
import {
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';
import { KIRITIMATI, PAGO_PAGO } from './utils/time-zones';

type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];

interface Notification {
  type: string;
  title: string;
  resourceId: string | null;
}

const DAY = 24 * 60 * 60 * 1000;

/** A calendar day so many days after `from`, YYYY-MM-DD. */
function day(from: Date, days: number): string {
  return new Date(from.getTime() + days * DAY).toISOString().slice(0, 10);
}

/**
 * Licence expiry reminders (ADR-064): 60, 30 and 7 days before and on the
 * day, once each per expiry date, to those who can renew a licence or
 * release production, and never twice.
 */
describe('Licence reminders (e2e)', () => {
  let app: INestApplication;
  let reminders: LicenceRemindersService;
  const now = new Date('2026-10-09T12:00:00Z');

  beforeAll(async () => {
    app = await createE2eApp();
    reminders = app.get(LicenceRemindersService);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  async function licence(
    agent: Agent,
    expiresAt: string | null,
    number = 'NPN 80012345',
  ) {
    return body<{ licence: { id: string } }>(
      await agent
        .post('/v1/product-licences')
        .send({ number, authority: 'Health Canada', expiresAt })
        .expect(201),
    ).licence.id;
  }

  async function bell(agent: Agent): Promise<Notification[]> {
    const response = body<Notification[] | { entries: Notification[] }>(
      await agent.get('/v1/notifications').expect(200),
    );
    const all = Array.isArray(response) ? response : response.entries;
    return all.filter((entry) => entry.type === 'licence.expiring');
  }

  it('tells at 60 days, once, and again at 30', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const id = await licence(alpha.agent, day(now, 60));

    expect(await reminders.remind(now)).toBe(1);
    expect(await reminders.remind(now)).toBe(0);
    const first = await bell(alpha.agent);
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ resourceId: id });
    expect(first[0].title).toContain('expires in 60 days');

    // A month on: the 30-day notice, and only it.
    expect(await reminders.remind(new Date(now.getTime() + 31 * DAY))).toBe(1);
    expect(await bell(alpha.agent)).toHaveLength(2);
  });

  /**
   * Each organization's own today (ADR-072). At noon UTC on 9 October it is
   * already 2 am on the 10th in Kiritimati (UTC+14): a licence whose last
   * day is the 9th is told "expires today" in UTC and "expired" there.
   */
  it('tells each organization by its own day', async () => {
    const utc = await registerOrganization(app, 'alpha');
    const ahead = await registerOrganization(app, 'beta');
    await ahead.agent
      .patch('/v1/organization')
      .send({ timeZone: 'Pacific/Kiritimati' })
      .expect(204);
    await licence(utc.agent, '2026-10-09');
    await licence(ahead.agent, '2026-10-09');

    expect(await reminders.remind(now)).toBe(2);
    expect((await bell(utc.agent))[0].title).toContain('expires today');
    expect((await bell(ahead.agent))[0].title).toContain('expired on');
  });

  /**
   * Every zone's today is within a day of UTC's, so the run reads its
   * window a day wider each side (ADR-072). At noon UTC on 9 October it is
   * already the 10th in Kiritimati: its 60-day notice is owed for a licence
   * expiring on 9 December, 61 days after UTC's today. At 5 am UTC it is
   * still the 8th in Pago Pago: a licence expired there on 1 October, a
   * week ago, is owed its last notice, 8 days before UTC's today.
   */
  it('reads its window a day wider than UTC each side', async () => {
    const ahead = await registerOrganization(app, 'alpha');
    await ahead.agent
      .patch('/v1/organization')
      .send({ timeZone: KIRITIMATI })
      .expect(204);
    await licence(ahead.agent, '2026-12-09');
    expect(await reminders.remind(now)).toBe(1);

    const behind = await registerOrganization(app, 'beta');
    await behind.agent
      .patch('/v1/organization')
      .send({ timeZone: PAGO_PAGO })
      .expect(204);
    await licence(behind.agent, '2026-10-01');
    expect(await reminders.remind(new Date('2026-10-09T05:00:00Z'))).toBe(1);
    expect((await bell(behind.agent))[0].title).toContain('expired on');
  });

  /**
   * A zone written by hand, or one a newer time-zone database dropped, is
   * read as UTC with a warning: the run goes on to every other
   * organization rather than stopping at it (ADR-072).
   */
  it('goes on past a zone it cannot read, telling that one by UTC', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const broken = await registerOrganization(app, 'beta');
    await app
      .get<Database>(UNSAFE_GLOBAL_DB)
      .update(organizations)
      .set({ timeZone: 'Mars/Olympus_Mons' })
      .where(eq(organizations.id, broken.organizationId));
    await licence(alpha.agent, '2026-10-09');
    await licence(broken.agent, '2026-10-09');

    expect(await reminders.remind(now)).toBe(2);
    expect((await bell(broken.agent))[0].title).toContain('expires today');
  });

  it('sends the latest owed after downtime, not every one missed', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await licence(alpha.agent, day(now, 5));

    expect(await reminders.remind(now)).toBe(1);
    const [notice] = await bell(alpha.agent);
    expect(notice.title).toContain('expires in 5 days');
  });

  it('starts again after a renewal, and says nothing of one long past', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const id = await licence(alpha.agent, day(now, 7));
    await licence(alpha.agent, null, 'NPN 80099999');
    await alpha.agent
      .post('/v1/product-licences')
      .send({
        number: 'OLD-1',
        authority: 'Health Canada',
        issuedAt: day(now, -400),
        expiresAt: day(now, -30),
      })
      .expect(201);

    expect(await reminders.remind(now)).toBe(1);

    // Renewed for a year: nothing is due until its 60 days.
    await alpha.agent
      .patch(`/v1/product-licences/${id}`)
      .send({ expiresAt: day(now, 365) })
      .expect(204);
    expect(await reminders.remind(now)).toBe(0);
    expect(await reminders.remind(new Date(now.getTime() + 306 * DAY))).toBe(1);
  });

  it('tells those who can act, not a viewer', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const viewer = await addViewer(app, alpha, 'viewer@alpha.example.com');
    await licence(alpha.agent, day(now, 0));

    expect(await reminders.remind(now)).toBe(1);
    const [notice] = await bell(alpha.agent);
    expect(notice.title).toContain('expires today');
    expect(await bell(viewer)).toHaveLength(0);
  });
});
