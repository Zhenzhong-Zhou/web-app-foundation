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
import {
  item,
  order,
  partner,
  point,
  receive,
  recipe,
  run,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';
import { shippedSale } from './utils/sales';
import { captureStatements } from './utils/statements';

interface HomeResponse {
  gettingStarted: {
    steps: Record<string, boolean>;
    teamSkipped: boolean;
    dismissed: boolean;
    complete: boolean;
  };
  welcome: unknown;
  cards: {
    kind: string;
    count: number;
    late: number;
    anyPoint: boolean | null;
  }[];
}

/**
 * Home (ADR-058; ADR-091): a tile per kind the member may see, each with
 * its count and how many are late, counted as its list filters them, and
 * no rows; the reads every Home makes in one transaction.
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

  /**
   * Days from today in UTC, the zone a new organization starts on, so the
   * days the server counts from (ADR-072).
   */
  const day = (offset: number) =>
    new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);

  async function home(org: { agent: Org['agent'] }, query = '') {
    return body<HomeResponse>(
      await org.agent.get(`/v1/home${query}`).expect(200),
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
      'lowStock',
      'expiring',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'production',
      'licences',
    ]);
    expect(cards.every((entry) => entry.count === 0 && entry.late === 0)).toBe(
      true,
    );
    // Counts, and no rows (ADR-091).
    expect(Object.keys(cards[0]).sort()).toEqual([
      'anyPoint',
      'count',
      'kind',
      'late',
    ]);
    // Nothing low is not nothing watched (ADR-085): Low stock says no
    // item has a point yet; every other tile, null.
    expect(card(cards, 'lowStock')?.anyPoint).toBe(false);
    expect(
      cards.filter((entry) => entry.kind !== 'lowStock').map((e) => e.anyPoint),
    ).toEqual(Array(8).fill(null));
  });

  it('counts confirmed purchases to receive as their list does, the overdue late', async () => {
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

    // The tile's 2 opens two: the list, filtered as the tile opens it.
    const list = body<{ entries: unknown[] }>(
      await alpha.agent
        .get('/v1/orders?status=confirmed&direction=purchase&outstanding=true')
        .expect(200),
    ).entries;
    expect(list).toHaveLength(2);
    expect(card(await home(alpha), 'toShip')?.count).toBe(0);
  });

  /**
   * Only what is still to ship or still to come (#163): an order shipped
   * or received in full stays confirmed until it is closed (#24), and
   * leaves the card; a line closed short counts for nothing.
   */
  it('counts only orders with something still to ship or to come', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Shelf',
    });
    const customer = await createPartner(alpha.agent, { name: 'Customer' });
    const supplier = await createPartner(alpha.agent, { name: 'Supplier' });
    const [focus, calm] = [
      await createVariant(alpha.agent, {
        type: 'good',
        name: 'Focus 60ct',
        variant: { sku: 'FOCUS-60', tracksLots: false },
      }),
      await createVariant(alpha.agent, {
        type: 'good',
        name: 'Calm 90ct',
        variant: { sku: 'CALM-90', tracksLots: false },
      }),
    ];
    for (const variantId of [focus, calm]) {
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId,
          toLocationId: shelf,
          quantity: '100',
          reason: 'receipt',
        })
        .expect(201);
    }

    /**
     * A confirmed order of 5 of each item given; each line then shipped or
     * received as much as `done` says, and closed short where `short`.
     */
    async function confirmed(
      direction: 'sale' | 'purchase',
      reference: string,
      lines: { variantId: string; done: string; short?: boolean }[],
    ) {
      const order = body<{ order: { id: string; lines: { id: string }[] } }>(
        await alpha.agent
          .post('/v1/orders')
          .send({
            partnerId: direction === 'sale' ? customer : supplier,
            direction,
            reference,
            lines: lines.map((line) => ({
              variantId: line.variantId,
              quantityOrdered: '5',
              unitPrice: '10',
              currency: 'CAD',
            })),
          })
          .expect(201),
      ).order;
      await alpha.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);

      for (const [index, line] of lines.entries()) {
        const lineId = order.lines[index].id;
        if (direction === 'sale') {
          await alpha.agent
            .post(`/v1/orders/${order.id}/shipments`)
            .send({
              fromLocationId: shelf,
              lines: [{ lineId, quantity: line.done }],
            })
            .expect(201);
        } else {
          await alpha.agent
            .post(`/v1/orders/${order.id}/lines/${lineId}/receipts`)
            .send({ toLocationId: shelf, quantity: line.done })
            .expect(201);
        }
        if (line.short) {
          await alpha.agent
            .post(`/v1/orders/${order.id}/lines/${lineId}/close`)
            .send({ reason: 'No more coming' })
            .expect(204);
        }
      }
      return order.id;
    }

    for (const direction of ['sale', 'purchase'] as const) {
      const prefix = direction === 'sale' ? 'SO' : 'PO';
      await confirmed(direction, `${prefix}-FULL`, [
        { variantId: focus, done: '5' },
      ]);
      const part = await confirmed(direction, `${prefix}-PART`, [
        { variantId: focus, done: '2' },
      ]);
      await confirmed(direction, `${prefix}-SHORT`, [
        { variantId: focus, done: '5' },
        { variantId: calm, done: '1', short: true },
      ]);

      const kind = direction === 'sale' ? 'toShip' : 'toReceive';
      expect(card(await home(alpha), kind)?.count).toBe(1);

      // The list the tile opens, with its filter, lists the one.
      const list = body<{ entries: { id: string }[] }>(
        await alpha.agent
          .get(
            `/v1/orders?status=confirmed&direction=${direction}&outstanding=true`,
          )
          .expect(200),
      ).entries;
      expect(list.map((entry) => entry.id)).toEqual([part]);
    }
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

    // Today: one lot within 90 days, none expired, as the list shows.
    expect(card(await home(alpha), 'expiring')).toMatchObject({
      count: 1,
      late: 0,
    });
    const [soon] = body<{
      entries: { lotId: string; lotCode: string }[];
    }>(
      await alpha.agent.get('/v1/stock?expiringWithin=90').expect(200),
    ).entries;
    expect(soon.lotCode).toBe('LOT-SOON');

    // A screen that still sends a day is not believed: the server counts
    // from the organization's today itself (ADR-072).
    const stale = card(await home(alpha, `?today=${day(21)}`), 'expiring');
    expect(stale?.late).toBe(0);

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

    // Its last day yesterday: LOT-SOON has expired, and counts as late.
    await alpha.agent
      .patch(`/v1/stock/lots/${soon.lotId}`)
      .send({ expiresAt: day(-1) })
      .expect(204);
    expect(card(await home(alpha), 'expiring')).toMatchObject({
      count: 1,
      late: 1,
    });
  });

  /**
   * Low stock (ADR-085): the items below their reorder point, counted as
   * the reorder points list on Low has them, the out among them late; its
   * drafts not read (#352).
   */
  it('counts the items below their reorder point as the list on Low does, the out late', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const supplier = await partner(alpha.agent, 'Nordic Supply');

    // Six low, one of them out, and one with enough; each position is its
    // stock on the shelf.
    const ids = new Map<string, string>();
    for (const [sku, onHand, reorderPoint] of [
      ['A-OUT', '0', '10'],
      ['B-TENTH', '10', '100'],
      ['C-FIFTH', '20', '100'],
      ['D-THIRD', '30', '90'],
      ['E-HALF', '50', '100'],
      ['F-NEAR', '95', '100'],
      ['G-ENOUGH', '300', '100'],
    ]) {
      const id = await item(alpha.agent, sku);
      if (onHand !== '0') await receive(alpha.agent, id, shelf, onHand);
      await point(alpha.agent, id, reorderPoint);
      ids.set(sku, id);
    }
    // A draft purchase for all E-HALF needs: drafted, still low.
    await order(alpha.agent, 'purchase', supplier, ids.get('E-HALF')!, '50', {
      draft: true,
    });

    const { result: cards, statements } = await captureStatements(() =>
      home(alpha),
    );

    expect(card(cards, 'lowStock')).toMatchObject({
      count: 6,
      late: 1,
      anyPoint: true,
    });
    // Every point's position worked out once, and no read of the drafts,
    // which Home never shows.
    expect(
      statements.filter(({ text }) => /from reorder_points rp\b/.test(text)),
    ).toHaveLength(1);
    expect(
      statements.filter(({ text }) =>
        /po\.output_variant_id = any\(/.test(text),
      ),
    ).toHaveLength(0);

    // The tile's 6 opens six: the list on Low, and its counts the same.
    const list = body<{ entries: unknown[] }>(
      await alpha.agent.get('/v1/stock/reorder-points?status=low').expect(200),
    ).entries;
    expect(list).toHaveLength(6);
    expect(
      body(
        await alpha.agent.get('/v1/stock/reorder-points/counts').expect(200),
      ),
    ).toMatchObject({ low: 6, out: 1 });
  });

  /**
   * Waiting for a cost (ADR-091): Stock value's list, a row for each
   * receipt still waiting, not Inventory's stock rows, which hold two
   * receipts of one item at one place as one.
   */
  it('counts the receipts waiting for a cost as Stock value lists them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const goods = await item(alpha.agent, 'FOCUS-60');
    await receive(alpha.agent, goods, shelf, '5');
    await receive(alpha.agent, goods, shelf, '7');

    expect(card(await home(alpha), 'costsWaiting')).toMatchObject({
      count: 2,
      late: 0,
    });
    const list = body<{ entries: unknown[] }>(
      await alpha.agent.get('/v1/costs/needs-cost').expect(200),
    ).entries;
    expect(list).toHaveLength(2);
  });

  // To ship and To receive are counted from one read of the orders, by
  // direction, each as its list filters it, the overdue late.
  it('counts To ship and To receive from one read of the orders', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const goods = await item(alpha.agent, 'FOCUS-60');
    const customer = await partner(alpha.agent, 'Customer');
    const supplier = await partner(alpha.agent, 'Supplier');
    for (const expectedAt of [day(-3), day(4)]) {
      await order(alpha.agent, 'sale', customer, goods, '5', { expectedAt });
    }
    await order(alpha.agent, 'purchase', supplier, goods, '5', {
      expectedAt: day(4),
    });
    // A draft has nothing to ship yet, overdue or not.
    await order(alpha.agent, 'sale', customer, goods, '5', {
      draft: true,
      expectedAt: day(-3),
    });

    const { result: cards, statements } = await captureStatements(() =>
      home(alpha),
    );

    expect(card(cards, 'toShip')).toMatchObject({ count: 2, late: 1 });
    expect(card(cards, 'toReceive')).toMatchObject({ count: 1, late: 0 });
    // The statement of counts reads the orders once, not once a card.
    const counts = statements.filter(({ text }) =>
      /as kind,\s*count\(\*\)::int as count/.test(text),
    );
    expect(counts).toHaveLength(1);
    expect(counts[0].text.match(/from "orders"/g)).toHaveLength(1);
  });

  /**
   * Each tile opens its list (ADR-091): the count is the rows the list
   * returns at the address the tile opens, and the late count the rows
   * its late button opens: Orders' Late, Reorder points' Out, and the
   * lots' and Licences' Expired. Licences open on Expiring, soonest first,
   * the expired leading.
   */
  it('opens, from each tile, as many rows as it counts, the late among them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;

    // A sale part shipped, with no expected day: to ship, and never late.
    // Its shipment drafts an invoice, and two bottles come back on an RMA.
    const sold = await shippedSale(agent);
    await agent
      .post('/v1/invoices')
      .send({ shipmentId: sold.shipmentId })
      .expect(201);
    await agent
      .post('/v1/return-authorizations')
      .send({
        orderId: sold.orderId,
        reason: 'Two bottles arrived cracked',
        lines: [
          { lineId: sold.capsulesLine, quantity: '2', resolution: 'credit' },
        ],
      })
      .expect(201);

    // Orders: late and not, each way; a late draft is nothing to ship yet.
    const goods = await item(agent, 'GOODS');
    const customer = await partner(agent, 'Customer');
    const supplier = await partner(agent, 'Supplier');
    const lateSale = await order(agent, 'sale', customer, goods, '5', {
      expectedAt: day(-3),
    });
    await order(agent, 'sale', customer, goods, '5', { expectedAt: day(4) });
    await order(agent, 'sale', customer, goods, '5', {
      draft: true,
      expectedAt: day(-9),
    });
    const latePurchase = await order(agent, 'purchase', supplier, goods, '5', {
      expectedAt: day(-6),
    });
    await order(agent, 'purchase', supplier, goods, '5', {
      expectedAt: day(13),
    });

    // Lots: one expired yesterday, one within 90 days, one a year off.
    const shelf = await site(agent, 'SHELF');
    const lotted = await item(agent, 'LOTTED', true);
    for (const [code, expiresAt] of [
      ['LOT-LATER', day(330)],
      ['LOT-SOON', day(13)],
      ['LOT-GONE', day(-1)],
    ]) {
      await receive(agent, lotted, shelf, '5', { code, expiresAt });
    }

    // Low stock: one out, one low; and a run released, of GOODS from LOW.
    const out = await item(agent, 'OUT');
    await point(agent, out, '10');
    const low = await item(agent, 'LOW');
    await receive(agent, low, shelf, '3');
    await point(agent, low, '10');
    const bomId = await recipe(agent, goods, low, '1');
    await run(
      agent,
      { outputId: goods, bomId, locationId: shelf, quantityPlanned: '1' },
      shelf,
    );

    // Licences: expired, within 60 days, past it, with none, and one
    // withdrawn whose day has passed too.
    for (const [number, expiresAt, isActive] of [
      ['L-SOON', day(30), true],
      ['L-GONE', day(-2), true],
      ['L-LATER', day(200), true],
      ['L-NEVER', undefined, true],
      ['L-WITHDRAWN', day(-5), false],
    ] as const) {
      const { licence } = body<{ licence: { id: string } }>(
        await agent
          .post('/v1/product-licences')
          .send({ number, authority: 'Health Canada', expiresAt })
          .expect(201),
      );
      if (!isActive) {
        await agent
          .patch(`/v1/product-licences/${licence.id}`)
          .send({ isActive: false })
          .expect(204);
      }
    }

    /** A list's rows, all on one page. */
    async function rows<T>(path: string): Promise<T[]> {
      const answer = body<T[] | { entries: T[]; nextCursor: string | null }>(
        await agent.get(path).expect(200),
      );
      if (Array.isArray(answer)) return answer;
      expect(answer.nextCursor).toBeNull();
      return answer.entries;
    }

    // Each tile's address, as the list's page asks its endpoint: To ship's
    // /orders?direction=sale&outstanding=1, the page's status Open beside
    // it, and Expiring soon's /inventory?expiring=1, by expiry (ADR-091).
    const opened: Record<string, string> = {
      toShip: '/v1/orders?status=open&direction=sale&outstanding=true',
      toReceive: '/v1/orders?status=open&direction=purchase&outstanding=true',
      lowStock: '/v1/stock/reorder-points?status=low',
      expiring: '/v1/stock?expiringWithin=90&sort=expiry&order=asc',
      costsWaiting: '/v1/costs/needs-cost',
      invoicesToIssue: '/v1/invoices?status=draft',
      returnsOpen: '/v1/return-authorizations?status=open',
      production: '/v1/production-orders?status=released',
      licences: '/v1/product-licences?expiring=true',
    };
    // Its late button's, where lateness applies: the tile's list with Late,
    // or Expired, chosen too (ADR-091).
    const lateOpened: Record<string, string> = {
      toShip: `${opened.toShip}&late=true`,
      toReceive: `${opened.toReceive}&late=true`,
      lowStock: '/v1/stock/reorder-points?status=out',
      expiring: `${opened.expiring}&expired=true`,
      licences: `${opened.licences}&expired=true`,
    };

    const cards = await home(alpha);
    expect(cards).toHaveLength(Object.keys(opened).length);
    for (const { kind, count, late } of cards) {
      const listed = await rows(opened[kind]);
      expect({ kind, count: listed.length }).toEqual({ kind, count });
      expect(count).toBeGreaterThan(0);

      // Its late button's rows; none where lateness does not apply.
      const lateRows = lateOpened[kind]
        ? (await rows(lateOpened[kind])).length
        : 0;
      expect({ kind, late: lateRows }).toEqual({ kind, late });
    }

    // Every tile has something; the late are those named above.
    expect(
      Object.fromEntries(cards.map(({ kind, late }) => [kind, late])),
    ).toEqual({
      toShip: 1,
      toReceive: 1,
      lowStock: 1,
      expiring: 1,
      costsWaiting: 0,
      invoicesToIssue: 0,
      returnsOpen: 0,
      production: 0,
      licences: 1,
    });
    const lateIds = async (path: string) =>
      (await rows<{ id: string }>(path)).map((row) => row.id);
    expect(await lateIds(lateOpened.toShip)).toEqual([lateSale.id]);
    expect(await lateIds(lateOpened.toReceive)).toEqual([latePurchase.id]);
    const lotCodes = async (path: string) =>
      (await rows<{ lotCode: string }>(path)).map((row) => row.lotCode);
    const numbers = async (path: string) =>
      (await rows<{ number: string }>(path)).map((row) => row.number);
    expect(await lotCodes(lateOpened.expiring)).toEqual(['LOT-GONE']);
    expect(await numbers(lateOpened.licences)).toEqual(['L-GONE']);

    // Expired alone, without the tile's filter, is the same rows: never a
    // withdrawn licence, whatever its day.
    expect(await lotCodes('/v1/stock?expired=true')).toEqual(['LOT-GONE']);
    expect(await numbers('/v1/product-licences?expired=true')).toEqual([
      'L-GONE',
    ]);

    // Late brings outstanding with it: a draft's day passing is not late.
    expect(
      await lateIds('/v1/orders?status=all&direction=sale&late=true'),
    ).toEqual([lateSale.id]);

    // Soonest first, the expired leading.
    expect(await lotCodes(opened.expiring)).toEqual(['LOT-GONE', 'LOT-SOON']);
    expect(await numbers(opened.licences)).toEqual(['L-GONE', 'L-SOON']);
  });

  /**
   * The reads every Home makes, in one transaction (ADR-091): the
   * organization's days, zone and What we do, the counts in one statement
   * and Low stock's beside it, Getting started, and the reader's
   * membership with its roles. The welcome's own reads, while it shows,
   * come after its commit.
   */
  it("reads Home's figures in one transaction of six statements", async () => {
    const alpha = await registerOrganization(app, 'alpha');

    /** Home's transaction: its statements, and what was sent after it. */
    async function transaction() {
      const { statements } = await captureStatements(() => home(alpha));
      const first = statements.findIndex(({ text }) =>
        /"expiry_warning_days", "time_zone", "what_we_do" from "organizations"/.test(
          text,
        ),
      );
      expect(first).toBeGreaterThan(0);
      const { client } = statements[first];
      expect(statements[first - 1]).toMatchObject({ client });
      expect(statements[first - 1].text).toMatch(/^\s*begin\b/i);

      const inside: string[] = [];
      let index = first;
      for (; index < statements.length; index++) {
        const { text, client: on } = statements[index];
        if (on !== client) continue;
        if (/^\s*commit\b/i.test(text)) break;
        inside.push(text);
      }
      // Nothing else of Home's on another connection meanwhile.
      const beside = statements
        .slice(first, index)
        .filter(({ client: on }) => on !== client);
      return { inside, beside, after: statements.slice(index + 1) };
    }

    // The founder's welcome shows: its reads come after the commit.
    const welcomed = await transaction();
    expect(welcomed.inside).toHaveLength(6);
    expect(welcomed.beside).toEqual([]);
    expect(welcomed.after.length).toBeGreaterThan(0);

    // Dismissed, Home is the transaction and nothing after it.
    await alpha.agent.post('/v1/home/welcome/dismiss').expect(204);
    const { inside, beside, after } = await transaction();
    // The organization, the counts, Low stock's, Getting started, then the
    // membership and its roles.
    expect(inside.map((text) => text.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(
        /^select "expiry_warning_days", "time_zone", "what_we_do" from "organizations"/,
      ),
      expect.stringMatching(
        /^\( select case "orders"\."direction" .* union all /,
      ),
      expect.stringMatching(/^with p as materialized .* 'lowStock'::text/),
      expect.stringMatching(/^select \(o\.tax_registration_number/),
      expect.stringMatching(
        /^select "memberships"\."id", .* from "memberships"/,
      ),
      expect.stringMatching(/^select "membership_roles"\."membership_id"/),
    ]);
    expect(beside).toEqual([]);
    expect(after).toEqual([]);
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
    expect(kinds).toEqual(['toShip', 'toReceive', 'lowStock', 'expiring']);
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

      // Another organization's product does not tick this one's step (#187).
      const product = {
        type: 'good',
        name: 'Focus 60ct',
        variant: { sku: 'FOCUS-60', tracksLots: false },
      };
      const beta = await registerOrganization(app, 'beta');
      await createVariant(beta.agent, product);
      expect((await started(alpha)).steps.product).toBe(false);

      await createVariant(alpha.agent, product);
      expect((await started(alpha)).steps.product).toBe(true);
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
});
