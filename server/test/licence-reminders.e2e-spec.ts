import type { INestApplication } from '@nestjs/common';

import { LicenceRemindersService } from '../src/modules/product-licences/licence-reminders.service';
import {
  addViewer,
  body,
  createE2eApp,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

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
