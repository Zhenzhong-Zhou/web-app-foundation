import type { INestApplication } from '@nestjs/common';
import { eq, inArray, isNotNull } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  type HomeLayout,
  memberships,
  permissions,
  rolePermissions,
  roles,
  sessions,
} from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  customRole,
  insertMember,
  registerOrganization,
  roleIdNamed,
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
    hidden: boolean;
    count: number;
    late: number;
    anyPoint: boolean | null;
  }[];
  recent: boolean;
  defaultLayout: { order: string[]; hidden: string[]; recent: boolean };
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

  /** The tiles drawn, in their order: the ones not hidden. */
  const shown = (cards: HomeResponse['cards']) =>
    cards.filter((entry) => !entry.hidden).map((entry) => entry.kind);

  /**
   * An Owner may do every tile's work, so every tile leads and their Home
   * is in the working day's order, as it was before Customise Home: Drafts
   * after To receive, hidden (ADR-091, amended November 2026).
   */
  it('shows every card to an owner in the order of a working day, each empty in a new organization', async () => {
    const alpha = await registerOrganization(app, 'alpha');

    const answer = body<HomeResponse>(
      await alpha.agent.get('/v1/home').expect(200),
    );
    const { cards } = answer;
    expect(cards.map((entry) => entry.kind)).toEqual([
      'toShip',
      'toReceive',
      'drafts',
      'lowStock',
      'expiring',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'production',
      'licences',
    ]);
    expect(shown(cards)).toEqual([
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
    expect(answer.recent).toBe(true);
    expect(cards.every((entry) => entry.count === 0 && entry.late === 0)).toBe(
      true,
    );
    // Counts, and no rows (ADR-091).
    expect(Object.keys(cards[0]).sort()).toEqual([
      'anyPoint',
      'count',
      'hidden',
      'kind',
      'late',
    ]);
    // Nothing low is not nothing watched (ADR-085): Low stock says no
    // item has a point yet; every other tile, null.
    expect(card(cards, 'lowStock')?.anyPoint).toBe(false);
    expect(
      cards.filter((entry) => entry.kind !== 'lowStock').map((e) => e.anyPoint),
    ).toEqual(Array(9).fill(null));
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

  // Equipment is not stock value (ADR-048, amended by ADR-092): its
  // receipts, with a cost or without, are no one's to-do.
  it('leaves equipment out of Waiting for a cost, as Stock value does', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await site(alpha.agent, 'SHELF');
    const goods = await item(alpha.agent, 'FOCUS-60');
    const filler = await createVariant(alpha.agent, {
      type: 'equipment',
      name: 'Capsule filler',
      variant: { sku: 'FILLER', unitOfMeasure: 'each' },
    });
    await receive(alpha.agent, goods, shelf, '5');
    await receive(alpha.agent, filler, shelf, '1');

    expect(card(await home(alpha), 'costsWaiting')).toMatchObject({
      count: 1,
    });
    const list = body<{ entries: { sku: string }[] }>(
      await alpha.agent.get('/v1/costs/needs-cost').expect(200),
    ).entries;
    expect(list.map((row) => row.sku)).toEqual(['FOCUS-60']);
  });

  // To ship and To receive are counted from one read of the orders, by
  // direction, each as its list filters it, the overdue late; the drafts
  // beside them.
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
    expect(card(cards, 'drafts')).toMatchObject({ count: 1, late: 0 });
    // The statement of counts reads the outstanding orders once, not once
    // a card, and the drafts beside them.
    const counts = statements.filter(({ text }) =>
      /'drafts' as kind/.test(text),
    );
    expect(counts).toHaveLength(1);
    expect(counts[0].text.match(/from "orders"/g)).toHaveLength(2);
    expect(counts[0].text.match(/from "order_lines"/g)).toHaveLength(1);
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
    // Two drafts, so that the tile's oldest first has an order to keep.
    const goods = await item(agent, 'GOODS');
    const customer = await partner(agent, 'Customer');
    const supplier = await partner(agent, 'Supplier');
    const lateSale = await order(agent, 'sale', customer, goods, '5', {
      expectedAt: day(-3),
    });
    await order(agent, 'sale', customer, goods, '5', { expectedAt: day(4) });
    const firstDraft = await order(agent, 'sale', customer, goods, '5', {
      draft: true,
      expectedAt: day(-9),
    });
    const secondDraft = await order(agent, 'purchase', supplier, goods, '5', {
      draft: true,
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
    // it, Drafts' /orders?status=draft&order=asc, and Expiring soon's
    // /inventory?expiring=1, by expiry (ADR-091).
    const opened: Record<string, string> = {
      toShip: '/v1/orders?status=open&direction=sale&outstanding=true',
      toReceive: '/v1/orders?status=open&direction=purchase&outstanding=true',
      drafts: '/v1/orders?status=draft&order=asc',
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
      drafts: 0,
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

    // The drafts oldest first, by when each was made (ADR-057, amended).
    expect(
      (await rows<{ id: string }>(opened.drafts)).map((row) => row.id),
    ).toEqual([firstDraft.id, secondDraft.id]);
  });

  /**
   * The reads every Home makes, in one transaction (ADR-091): the
   * organization's days, zone and What we do with Getting started, its
   * row read once (#505's 68), the counts in one statement and Low
   * stock's beside it, and the reader's membership with their layout. The
   * welcome's own reads, while it shows, come after its commit, the
   * member's roles among them, in the invitation's transaction, never
   * read once it is gone (#505's 67).
   */
  it("reads Home's figures in one transaction of four statements", async () => {
    const alpha = await registerOrganization(app, 'alpha');

    /** Home's transaction: its statements, and what was sent after it. */
    async function transaction() {
      const { statements } = await captureStatements(() => home(alpha));
      const first = statements.findIndex(({ text }) =>
        /o\.expiry_warning_days as days,\s*o\.time_zone/.test(text),
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

    // The founder's welcome shows: its reads come after the commit, the
    // roles among them.
    const roles = /from "membership_roles"/;
    const welcomed = await transaction();
    expect(welcomed.inside).toHaveLength(4);
    expect(welcomed.beside).toEqual([]);
    expect(welcomed.after.filter(({ text }) => roles.test(text))).toHaveLength(
      1,
    );
    // The roles in the invitation's transaction, not one of their own.
    const read = welcomed.after.findIndex(({ text }) => roles.test(text));
    const invitation = welcomed.after.findIndex(({ text }) =>
      /from "invitations"/.test(text),
    );
    const { client } = welcomed.after[read];
    expect(welcomed.after[invitation].client).toBe(client);
    expect(
      welcomed.after
        .slice(Math.min(read, invitation), Math.max(read, invitation))
        .filter(({ client: on }) => on === client)
        .map(({ text }) => text),
    ).not.toContainEqual(expect.stringMatching(/^\s*(begin|commit)\b/i));

    // Dismissed, Home is the transaction and nothing after it.
    await alpha.agent.post('/v1/home/welcome/dismiss').expect(204);
    const { inside, beside, after } = await transaction();
    // The organization with Getting started, the counts, Low stock's, then
    // the membership, and never its roles.
    expect(inside.map((text) => text.replace(/\s+/g, ' ').trim())).toEqual([
      expect.stringMatching(
        /^select o\.expiry_warning_days as days, .* \(o\.tax_registration_number .* from organizations o where/,
      ),
      expect.stringMatching(
        /^\( select kind, count\(\*\)::int as count, .* union all /,
      ),
      expect.stringMatching(/^with p as materialized .* 'lowStock'::text/),
      expect.stringMatching(
        /^select "memberships"\."id", .* from "memberships"/,
      ),
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

    const { result: cards, statements } = await captureStatements(() =>
      home({ agent: member }),
    );
    expect(cards.map((entry) => entry.kind)).toEqual([
      'toShip',
      'toReceive',
      'drafts',
      'lowStock',
      'expiring',
    ]);
    // A card the member may not view is never counted: no statement reads
    // what only Licences expiring counts.
    expect(statements.map(({ text }) => text).join('\n')).not.toMatch(
      /\bproduct_licences\b/,
    );
  });

  /**
   * The default order (ADR-091, amended November 2026): the tiles whose
   * work the member may do lead, the rest follow, both in the working
   * day's order. Roles are each organization's own, so it goes by the
   * permissions held, never by a role's name.
   */
  it('leads with the tiles whose work the member may do', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    // Every tile's view, so only the work held changes the order.
    const views = [
      'orders.view',
      'stock.view',
      'costs.view',
      'invoices.view',
      'return_authorizations.view',
      'production.view',
      'product_licences.view',
    ];
    const homeAs = async (name: string, work: string[]) => {
      await customRole(app, alpha.organizationId, name, [...views, ...work]);
      const member = await addMember(
        app,
        alpha,
        `${name.toLowerCase()}@example.com`,
        name,
      );
      return home({ agent: member });
    };
    const rest = [
      'expiring',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'production',
      'licences',
    ];

    // Finance's work, issuing invoices, costing receipts and closing
    // returns: those three first, the working day's order after them.
    expect(
      shown(
        await homeAs('Finance', [
          'invoices.issue',
          'costs.update',
          'return_authorizations.update',
        ]),
      ),
    ).toEqual([
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'toShip',
      'toReceive',
      'lowStock',
      'expiring',
      'production',
      'licences',
    ]);
    // Receives alone: To receive before To ship.
    expect(shown(await homeAs('Receiving', ['orders.receive']))).toEqual([
      'toReceive',
      'toShip',
      'lowStock',
      ...rest,
    ]);
    // Plans and completes runs: Low stock and In progress first.
    expect(
      shown(
        await homeAs('Planning', ['production.create', 'production.complete']),
      ),
    ).toEqual([
      'lowStock',
      'production',
      'toShip',
      'toReceive',
      'expiring',
      'costsWaiting',
      'invoicesToIssue',
      'returnsOpen',
      'licences',
    ]);
    // Raises orders: Drafts leads with Low stock, still hidden.
    const buying = await homeAs('Buying', ['orders.create']);
    expect(buying.map((entry) => entry.kind)).toEqual([
      'drafts',
      'lowStock',
      'toShip',
      'toReceive',
      ...rest,
    ]);
    expect(card(buying, 'drafts')?.hidden).toBe(true);
  });

  /**
   * Drafts (ADR-091, amended November 2026): every draft order, as Orders
   * lists them with Draft chosen, both ways, never late, and hidden until
   * the person shows it; Reset to default hides it again.
   */
  it('counts every draft as Orders lists them with Draft chosen, never late, hidden by default', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const goods = await item(alpha.agent, 'GOODS');
    const customer = await partner(alpha.agent, 'Customer');
    const supplier = await partner(alpha.agent, 'Supplier');
    // Its expected day long past, a draft is still not late.
    await order(alpha.agent, 'sale', customer, goods, '5', {
      draft: true,
      expectedAt: day(-9),
    });
    await order(alpha.agent, 'purchase', supplier, goods, '5', {
      draft: true,
    });
    await order(alpha.agent, 'sale', customer, goods, '5', {
      expectedAt: day(-3),
    });
    // Another organization's draft is not alpha's.
    const beta = await registerOrganization(app, 'beta');
    await order(
      beta.agent,
      'sale',
      await partner(beta.agent, 'Customer'),
      await item(beta.agent, 'GOODS'),
      '5',
      { draft: true },
    );

    const cards = await home(alpha);
    expect(card(cards, 'drafts')).toEqual({
      kind: 'drafts',
      hidden: true,
      count: 2,
      late: 0,
      anyPoint: null,
    });
    expect(card(cards, 'toShip')).toMatchObject({ count: 1, late: 1 });
    const { entries, nextCursor } = body<{
      entries: unknown[];
      nextCursor: string | null;
    }>(await alpha.agent.get('/v1/orders?status=draft').expect(200));
    expect({ rows: entries.length, nextCursor }).toEqual({
      rows: 2,
      nextCursor: null,
    });

    // Shown in Customise Home, then Reset to default: hidden again.
    const kinds = cards.map((entry) => entry.kind);
    await alpha.agent
      .put('/v1/home/layout')
      .send({ order: kinds, hidden: [], recent: true })
      .expect(204);
    expect(card(await home(alpha), 'drafts')?.hidden).toBe(false);
    await alpha.agent.delete('/v1/home/layout').expect(204);
    expect(card(await home(alpha), 'drafts')?.hidden).toBe(true);
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

  /**
   * Customise Home's layout (ADR-091, amended November 2026): the
   * person's own, on their membership alone, saved by Done and cleared by
   * Done on the default.
   */
  describe('the layout', () => {
    /** Every layout saved, by whose membership in which organization. */
    const saved = () =>
      db
        .select({
          userId: memberships.userId,
          organizationId: memberships.organizationId,
          homeLayout: memberships.homeLayout,
        })
        .from(memberships)
        .where(isNotNull(memberships.homeLayout));

    const arranged = {
      order: ['lowStock', 'toShip', 'licences', 'toReceive'],
      hidden: ['licences'],
      recent: false,
    };

    it('keeps the layout saved, replaced by the next, keeping the kinds stored it does not name, and DELETE clears it', async () => {
      const alpha = await registerOrganization(app, 'alpha');

      await alpha.agent.put('/v1/home/layout').send(arranged).expect(204);
      expect(await saved()).toEqual([
        {
          userId: alpha.userId,
          organizationId: alpha.organizationId,
          homeLayout: arranged,
        },
      ]);

      // The kinds stored that the next does not name follow it, hidden as
      // they were.
      const next = {
        order: ['toReceive', 'toShip'],
        hidden: ['toShip'],
        recent: true,
      };
      await alpha.agent.put('/v1/home/layout').send(next).expect(204);
      expect((await saved()).map((row) => row.homeLayout)).toEqual([
        {
          order: ['toReceive', 'toShip', 'lowStock', 'licences'],
          hidden: ['toShip', 'licences'],
          recent: true,
        },
      ]);

      await alpha.agent.delete('/v1/home/layout').expect(204);
      expect(await saved()).toEqual([]);
    });

    it('puts the tiles in the order saved, hidden as saved, with Recently opened as saved', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const order = [
        'returnsOpen',
        'drafts',
        'toShip',
        'licences',
        'lowStock',
        'toReceive',
        'production',
        'expiring',
        'invoicesToIssue',
        'costsWaiting',
      ];
      await alpha.agent
        .put('/v1/home/layout')
        .send({ order, hidden: ['toShip', 'production'], recent: false })
        .expect(204);

      const answer = body<HomeResponse>(
        await alpha.agent.get('/v1/home').expect(200),
      );
      expect(answer.cards.map((entry) => entry.kind)).toEqual(order);
      expect(shown(answer.cards)).toEqual(
        order.filter((kind) => !['toShip', 'production'].includes(kind)),
      );
      expect(answer.recent).toBe(false);
      // The default beside it, for Reset to default, whatever was saved.
      expect(answer.defaultLayout).toEqual({
        order: [
          'toShip',
          'toReceive',
          'drafts',
          'lowStock',
          'expiring',
          'costsWaiting',
          'invoicesToIssue',
          'returnsOpen',
          'production',
          'licences',
        ],
        hidden: ['drafts'],
        recent: true,
      });
    });

    /**
     * A layout from another build: a kind this one does not know is
     * skipped, and one the layout does not hold, such as a kind added
     * since, takes its default place, after the kind before it by
     * default, hidden only if it is by default.
     */
    it('skips a kind it does not know, and puts one missing where it goes by default', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await db
        .update(memberships)
        .set({
          homeLayout: {
            order: [
              'lowStock',
              'weather',
              'toReceive',
              'toShip',
              'expiring',
              'costsWaiting',
              'invoicesToIssue',
              'returnsOpen',
              'production',
            ],
            hidden: ['toReceive', 'weather'],
            recent: true,
          },
        })
        .where(eq(memberships.userId, alpha.userId));

      const cards = await home(alpha);
      expect(cards.map(({ kind, hidden }) => [kind, hidden])).toEqual([
        ['lowStock', false],
        ['toReceive', true],
        ['drafts', true],
        ['toShip', false],
        ['expiring', false],
        ['costsWaiting', false],
        ['invoicesToIssue', false],
        ['returnsOpen', false],
        ['production', false],
        ['licences', false],
      ]);
    });

    /**
     * A layout stored in another shape, which only a later build rolled
     * back would leave: read as none, never a failed Home, and a kind in
     * it twice comes back once.
     */
    it('reads a stored layout of another shape as none, and a kind twice once', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const store = (homeLayout: unknown) =>
        db
          .update(memberships)
          .set({ homeLayout: homeLayout as HomeLayout })
          .where(eq(memberships.userId, alpha.userId));
      const byDefault = (await home(alpha)).map(({ kind }) => kind);

      for (const shape of [
        { order: ['lowStock', 'toShip'], recent: true },
        { order: 'lowStock', hidden: [], recent: true },
        ['lowStock', 'toShip'],
      ]) {
        await store(shape);
        expect((await home(alpha)).map(({ kind }) => kind)).toEqual(byDefault);
      }
      // Done over it saves, as over none.
      await alpha.agent.put('/v1/home/layout').send(arranged).expect(204);
      expect((await saved()).map((row) => row.homeLayout)).toEqual([arranged]);

      const order = [
        'lowStock',
        ...byDefault.filter((kind) => kind !== 'lowStock'),
      ];
      await store({
        order: [...order, 'lowStock'],
        hidden: ['toShip', 'toShip'],
        recent: true,
      });
      const cards = await home(alpha);
      expect(cards.map(({ kind }) => kind)).toEqual(order);
      expect(card(cards, 'toShip')).toMatchObject({ hidden: true });
    });

    // A hidden tile buries nothing (ADR-091): its late still count.
    it('still counts a hidden tile, and its late', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const goods = await item(alpha.agent, 'GOODS');
      const customer = await partner(alpha.agent, 'Customer');
      for (const expectedAt of [day(-3), day(4)]) {
        await order(alpha.agent, 'sale', customer, goods, '5', { expectedAt });
      }
      await alpha.agent
        .put('/v1/home/layout')
        .send({ order: ['toShip'], hidden: ['toShip'], recent: true })
        .expect(204);

      expect(card(await home(alpha), 'toShip')).toMatchObject({
        hidden: true,
        count: 2,
        late: 1,
      });
    });

    it('refuses with 400 a kind it does not know, a kind twice, a hidden kind not in the order, or a part missing, writing nothing', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await alpha.agent.put('/v1/home/layout').send(arranged).expect(204);

      const refused = [
        { ...arranged, order: [...arranged.order, 'weather'] },
        { ...arranged, hidden: ['weather'] },
        { ...arranged, order: ['toShip', 'lowStock', 'toShip'] },
        { ...arranged, hidden: ['licences', 'licences'] },
        { ...arranged, hidden: ['expiring'] },
        { ...arranged, order: 'toShip' },
        { ...arranged, recent: 'yes' },
        { order: arranged.order, hidden: arranged.hidden },
        { hidden: [], recent: true },
        { ...arranged, pinned: ['toShip'] },
      ];
      for (const layout of refused) {
        await alpha.agent.put('/v1/home/layout').send(layout).expect(400);
      }
      expect((await saved()).map((row) => row.homeLayout)).toEqual([arranged]);

      // The hidden kind not placed says what to fix, in words (#148).
      const { message } = body<{ message: string[] }>(
        await alpha.agent
          .put('/v1/home/layout')
          .send({ ...arranged, hidden: ['expiring'] })
          .expect(400),
      );
      expect(message).toEqual([
        'A hidden tile must keep its place in the order too.',
      ]);

      // With no order, only order's own refusal: nothing hidden is unplaced.
      const missing = body<{ message: string[] }>(
        await alpha.agent
          .put('/v1/home/layout')
          .send({ hidden: [], recent: true })
          .expect(400),
      ).message;
      expect(missing.length).toBeGreaterThan(0);
      expect(missing.join('\n')).toMatch(/\border\b/);
      expect(missing.join('\n')).not.toMatch(/keep its place/);
    });

    it('keeps a kind the member may not see today, since their roles may change', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await customRole(app, alpha.organizationId, 'Packer', ['orders.view']);
      const packer = await addMember(
        app,
        alpha,
        'packer@example.com',
        'Packer',
      );
      expect((await home({ agent: packer })).map((each) => each.kind)).toEqual([
        'toShip',
        'toReceive',
        'drafts',
      ]);

      const layout = {
        order: ['licences', 'toReceive', 'toShip'],
        hidden: ['licences'],
        recent: true,
      };
      await packer.put('/v1/home/layout').send(layout).expect(204);
      expect((await saved()).map((row) => row.homeLayout)).toEqual([layout]);

      // Home skips it, never counting it: no statement reads its table.
      // Drafts, not in the layout, goes after To receive, where it is by
      // default, hidden.
      const { result: cards, statements } = await captureStatements(() =>
        home({ agent: packer }),
      );
      expect(statements.map(({ text }) => text).join('\n')).not.toMatch(
        /\bproduct_licences\b/,
      );
      expect(cards.map(({ kind, hidden }) => [kind, hidden])).toEqual([
        ['toReceive', false],
        ['drafts', true],
        ['toShip', false],
      ]);

      // Their next Done sends only the kinds they see: the one they may
      // not see stays, after them, hidden as it was.
      await packer
        .put('/v1/home/layout')
        .send({
          order: ['toShip', 'toReceive', 'drafts'],
          hidden: [],
          recent: true,
        })
        .expect(204);
      expect((await saved()).map((row) => row.homeLayout)).toEqual([
        {
          order: ['toShip', 'toReceive', 'drafts', 'licences'],
          hidden: ['licences'],
          recent: true,
        },
      ]);
    });

    it("changes only the reader's own: nobody else's, nor theirs in another organization", async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const beta = await registerOrganization(app, 'beta');
      const viewer = await addMember(
        app,
        alpha,
        'viewer@example.com',
        'Viewer',
      );
      const { user: viewerUser } = body<{ user: { id: string } }>(
        await viewer.get('/v1/auth/me').expect(200),
      );
      // Alpha's Owner works in beta too.
      await insertMember(app, {
        userId: alpha.userId,
        organizationId: beta.organizationId,
        roleId: await roleIdNamed(app, beta.organizationId, 'Owner'),
      });
      const row = (
        userId: string,
        organizationId: string,
        homeLayout: unknown,
      ) => ({
        userId,
        organizationId,
        homeLayout,
      });

      await alpha.agent.put('/v1/home/layout').send(arranged).expect(204);
      expect(await saved()).toEqual([
        row(alpha.userId, alpha.organizationId, arranged),
      ]);

      // A Viewer arranges their own, no permission asked; beta's Owner
      // clears theirs, which is no one else's.
      const theirs = { order: ['returnsOpen'], hidden: [], recent: true };
      await viewer.put('/v1/home/layout').send(theirs).expect(204);
      await beta.agent.delete('/v1/home/layout').expect(204);

      // Alpha's Owner, switched to beta, arranges it otherwise there.
      await db
        .update(sessions)
        .set({ currentOrgId: beta.organizationId })
        .where(eq(sessions.userId, alpha.userId));
      const inBeta = { order: ['production'], hidden: [], recent: false };
      await alpha.agent.put('/v1/home/layout').send(inBeta).expect(204);

      const all = await saved();
      expect(all).toHaveLength(3);
      expect(all).toEqual(
        expect.arrayContaining([
          row(alpha.userId, alpha.organizationId, arranged),
          row(alpha.userId, beta.organizationId, inBeta),
          row(viewerUser.id, alpha.organizationId, theirs),
        ]),
      );

      await viewer.delete('/v1/home/layout').expect(204);
      expect((await saved()).map((each) => each.userId)).toEqual([
        alpha.userId,
        alpha.userId,
      ]);
    });
  });
});
