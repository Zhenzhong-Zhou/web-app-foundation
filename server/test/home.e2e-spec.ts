import type { INestApplication } from '@nestjs/common';
import { inArray } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { permissions, rolePermissions, roles } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  registerOrganization,
} from './utils/fixtures';
import { resetDatabase } from './utils/reset-db';

interface HomeResponse {
  gettingStarted: {
    steps: Record<string, boolean>;
    teamSkipped: boolean;
    dismissed: boolean;
    complete: boolean;
  };
  cards: {
    kind: string;
    count: number;
    late: number;
    rows: { id: string; title: string; due: string | null; late: boolean }[];
  }[];
}

/**
 * Home (ADR-058, step 2): a card per kind the member may see, each with its
 * count, how many are late, and its five most urgent rows, counted as its
 * list filters them.
 */
describe('Home (e2e)', () => {
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

  type Org = Awaited<ReturnType<typeof registerOrganization>>;

  /** Days from today, as the reader's calendar writes them. */
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  async function home(org: { agent: Org['agent'] }, today = day(0)) {
    return body<HomeResponse>(
      await org.agent.get(`/v1/home?today=${today}`).expect(200),
    ).cards;
  }

  const card = (cards: HomeResponse['cards'], kind: string) =>
    cards.find((entry) => entry.kind === kind);

  it('shows every card to an owner, each empty in a new organization', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    const cards = await home(alpha);
    expect(cards.map((entry) => entry.kind)).toEqual([
      'toShip',
      'toReceive',
      'expiring',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'production',
      'licences',
    ]);
    expect(
      cards.every((entry) => entry.count === 0 && entry.rows.length === 0),
    ).toBe(true);
  });

  it('counts confirmed purchases to receive as their list does, overdue first', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const partner = await createPartner(alpha.agent, { name: 'Supplier' });
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: false },
    });
    for (const [reference, expectedAt] of [
      ['PO-LATE', day(-6)],
      ['PO-SOON', day(13)],
    ]) {
      const order = body<{ order: { id: string } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: partner,
            direction: 'purchase',
            reference,
            expectedAt,
            lines: [{ variantId: variant, quantityOrdered: '5' }],
          })
          .expect(201),
      ).order;
      await alpha.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);
    }

    const toReceive = card(await home(alpha), 'toReceive');
    expect(toReceive).toMatchObject({ count: 2, late: 1 });
    expect(toReceive?.rows.map((row) => [row.title, row.late])).toEqual([
      ['PO-LATE', true],
      ['PO-SOON', false],
    ]);

    // "See all 2" opens two: the list, filtered as the card's link sets it.
    const list = body<{ entries: unknown[] }>(
      await alpha.agent
        .get('/v1/orders?status=confirmed&direction=purchase')
        .expect(200),
    ).entries;
    expect(list).toHaveLength(2);
    expect(card(await home(alpha), 'toShip')?.count).toBe(0);
  });

  it('lists lots expiring soon, the expired ones counted late', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const location = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Main',
    });
    const variant = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Focus 60ct',
      variant: { sku: 'FOCUS-60', tracksLots: true },
    });
    for (const [code, expiresAt] of [
      ['LOT-SOON', day(13)],
      ['LOT-LATER', day(330)],
    ]) {
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: variant,
          toLocationId: location,
          quantity: '5',
          reason: 'receipt',
          lot: { code, expiresAt },
        })
        .expect(201);
    }

    // Today: one lot within 90 days, none expired.
    const expiring = card(await home(alpha), 'expiring');
    expect(expiring).toMatchObject({ count: 1, late: 0 });
    expect(expiring?.rows[0]).toMatchObject({
      title: 'LOT-SOON',
      due: day(13),
    });

    // Read as if three weeks on, in the reader's calendar: LOT-SOON expired.
    const later = card(await home(alpha, day(21)), 'expiring');
    expect(later?.late).toBe(1);

    // The organization's own days (ADR-060): a year counts both lots, ten
    // days neither.
    await alpha.agent
      .patch('/v1/organization')
      .send({ expiryWarningDays: 365 })
      .expect(204);
    expect(card(await home(alpha), 'expiring')?.count).toBe(2);
    await alpha.agent
      .patch('/v1/organization')
      .send({ expiryWarningDays: 10, expiryCriticalDays: 5 })
      .expect(204);
    expect(card(await home(alpha), 'expiring')?.count).toBe(0);
  });

  it('shows only the cards the member may view', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const [role] = await db
      .insert(roles)
      .values({
        organizationId: alpha.organizationId,
        name: 'Warehouse',
        isSystem: false,
      })
      .returning();
    const rows = await db
      .select()
      .from(permissions)
      .where(inArray(permissions.key, ['stock.view', 'orders.view']));
    await db
      .insert(rolePermissions)
      .values(rows.map((p) => ({ roleId: role.id, permissionId: p.id })));
    const member = await addMember(
      app,
      alpha,
      'warehouse@example.com',
      'Warehouse',
    );

    const kinds = (await home({ agent: member })).map((entry) => entry.kind);
    expect(kinds).toEqual(['toShip', 'toReceive', 'expiring']);
  });

  describe('Getting started', () => {
    async function started(org: { agent: Org['agent'] }) {
      return body<HomeResponse>(await org.agent.get('/v1/home').expect(200))
        .gettingStarted;
    }

    it('ticks each step by what the organization holds', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      const before = await started(alpha);
      expect(before).toMatchObject({
        teamSkipped: false,
        dismissed: false,
        complete: false,
      });
      expect(before.steps).toMatchObject({
        location: false,
        product: false,
        partner: false,
        receipt: false,
        invoice: false,
        team: false,
      });

      await createLocation(alpha.agent, { type: 'site', name: 'Main' });
      await createPartner(alpha.agent, { name: 'Northside' });

      const after = await started(alpha);
      expect(after.steps).toMatchObject({
        location: true,
        partner: true,
        product: false,
      });
    });

    it('lets the team step be skipped, and the card dismissed and shown', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent.post('/v1/home/getting-started/skip-team').expect(204);
      expect((await started(alpha)).teamSkipped).toBe(true);

      await alpha.agent.post('/v1/home/getting-started/dismiss').expect(204);
      expect((await started(alpha)).dismissed).toBe(true);

      await alpha.agent.delete('/v1/home/getting-started/dismiss').expect(204);
      expect((await started(alpha)).dismissed).toBe(false);
    });

    it('leaves Skip and Dismiss to those who may change the settings', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const viewer = await addMember(
        app,
        alpha,
        'viewer@example.com',
        'Viewer',
      );

      await viewer.post('/v1/home/getting-started/dismiss').expect(403);
      await viewer.post('/v1/home/getting-started/skip-team').expect(403);
      // A second member: the team step is done for everyone.
      expect((await started(alpha)).steps.team).toBe(true);
    });
  });

  it('refuses a day that is not a day', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await alpha.agent.get('/v1/home?today=2026-02-30').expect(400);
  });
});
