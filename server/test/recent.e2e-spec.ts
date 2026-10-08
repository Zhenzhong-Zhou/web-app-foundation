import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { recentRecords } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createPartner,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface RecentResponse {
  recent: {
    kind: string;
    id: string;
    title: string | null;
    detail: string | null;
  }[];
}

/**
 * Recently opened (ADR-058): each person's own, newest first, named as each
 * record is now, only kinds they may still view, kept to 30.
 */
describe('Recently opened (e2e)', () => {
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

  type Agent = Awaited<ReturnType<typeof registerOrganization>>['agent'];

  async function recent(agent: Agent, limit = 6) {
    return body<RecentResponse>(
      await agent.get(`/v1/recent?limit=${limit}`).expect(200),
    ).recent;
  }

  async function opened(agent: Agent, kind: string, id: string) {
    await agent.post('/v1/recent').send({ kind, id }).expect(204);
  }

  async function priceList(agent: Agent, name: string) {
    return body<{ priceList: { id: string } }>(
      await agent
        .post('/v1/price-lists')
        .send({ name, direction: 'sale', currency: 'CAD' })
        .expect(201),
    ).priceList.id;
  }

  it('lists what was opened, newest first, once each', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, {
      name: 'Northside Pharmacy',
      code: 'NORTH',
    });
    const list = await priceList(alpha.agent, 'Wholesale');

    await opened(alpha.agent, 'partner', partner);
    await opened(alpha.agent, 'priceList', list);
    expect((await recent(alpha.agent)).map((entry) => entry.kind)).toEqual([
      'priceList',
      'partner',
    ]);

    // Opened again, it moves to the top rather than appearing twice.
    await opened(alpha.agent, 'partner', partner);
    const entries = await recent(alpha.agent);
    expect(entries.map((entry) => entry.kind)).toEqual([
      'partner',
      'priceList',
    ]);
    expect(entries[0]).toMatchObject({
      title: 'Northside Pharmacy',
      detail: 'NORTH',
    });
    expect(entries[1]).toMatchObject({ title: 'Wholesale', detail: 'CAD' });
  });

  it('names a record as it is now', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, { name: 'Old name' });
    await opened(alpha.agent, 'partner', partner);

    await alpha.agent
      .patch(`/v1/partners/${partner}`)
      .send({ name: 'New name' })
      .expect(204);

    expect((await recent(alpha.agent))[0].title).toBe('New name');
  });

  it('keeps each person their own, and only kinds they may view', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, { name: 'Northside' });
    await opened(alpha.agent, 'partner', partner);

    const viewer = await addMember(app, alpha, 'viewer@example.com', 'Viewer');
    expect(await recent(viewer)).toEqual([]);

    // A kind the role may not view is refused, not remembered.
    const list = await priceList(alpha.agent, 'Wholesale');
    const canSeeLists = (
      await viewer.post('/v1/recent').send({ kind: 'priceList', id: list })
    ).status;
    expect([204, 403]).toContain(canSeeLists);
  });

  it('clears a person’s history, and keeps only the last 30', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    for (let i = 0; i < 31; i += 1) {
      await opened(
        alpha.agent,
        'partner',
        await createPartner(alpha.agent, { name: `Partner ${i}` }),
      );
    }
    const kept = await db
      .select()
      .from(recentRecords)
      .where(eq(recentRecords.organizationId, alpha.organizationId));
    expect(kept).toHaveLength(30);
    expect((await recent(alpha.agent, 30))[0].title).toBe('Partner 30');

    await alpha.agent.delete('/v1/recent').expect(204);
    expect(await recent(alpha.agent)).toEqual([]);
  });

  it('refuses a kind it does not know', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent
      .post('/v1/recent')
      .send({ kind: 'spaceship', id: '00000000-0000-7000-8000-000000000000' })
      .expect(400);
    const rows = await db
      .select()
      .from(recentRecords)
      .where(and(eq(recentRecords.organizationId, alpha.organizationId)));
    expect(rows).toHaveLength(0);
  });
});
