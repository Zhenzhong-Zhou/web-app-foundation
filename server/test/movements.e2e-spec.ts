import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { ROLE_TEMPLATES } from '../src/core/authorization/permissions';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { stockMovements } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import {
  item,
  order,
  output,
  partner,
  receive,
  receiveLine,
  recipe,
  run,
  ship,
  site,
} from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

/** A movement as GET /v1/stock/movements lists it (ADR-093, R9). */
interface Row {
  id: string;
  variantId: string;
  productId: string;
  sku: string;
  currentSku: string;
  productName: string;
  variantName: string | null;
  type: string;
  unitOfMeasure: string;
  quantity: string;
  reason: string;
  fromLocationId: string | null;
  fromLocationName: string | null;
  fromLocationCode: string | null;
  fromLocationPath: string[];
  toLocationId: string | null;
  toLocationName: string | null;
  toLocationCode: string | null;
  toLocationPath: string[];
  lotId: string | null;
  lotCode: string | null;
  lotExpiresAt: string | null;
  actorName: string | null;
  document: { kind: string; id: string; number: string | null } | null;
  recipient: { id: string; name: string } | null;
  quantityIn: string | null;
  quantityOut: string | null;
  change: string | null;
  balance: string | null;
}

interface Period {
  opening: string | null;
  quantityIn: string;
  quantityOut: string;
  closing: string | null;
}

interface Page {
  entries: Row[];
  nextCursor: string | null;
  period: Period | null;
}

/**
 * Movements' one row and its filters (ADR-093, R9, R10, R13, R24 and
 * 96a): what a row says of its item, lot, places and document, to whom;
 * an order's movements; and the order the list keeps, newest first by
 * when each was recorded, then by id.
 */
describe('Movements (e2e)', () => {
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

  async function list(agent: Pick<Agent, 'get'>, query = ''): Promise<Page> {
    return body<Page>(
      await agent.get(`/v1/stock/movements${query}`).expect(200),
    );
  }

  /** Every row the filters match, page after page of `limit`. */
  async function everyPage(agent: Agent, query: string, limit: number) {
    const rows: Row[] = [];
    let before: string | null = null;
    do {
      const cursor: string = before ? `&before=${before}` : '';
      const page = await list(agent, `?limit=${limit}${query}${cursor}`);
      rows.push(...page.entries);
      before = page.nextCursor;
    } while (before);
    return rows;
  }

  /**
   * Vitamin C, a material tracked by lot, received as VITC-90 into Shelf
   * A2, its code then corrected to VITC-100, and 4 moved to Shelf B1 with
   * a note, both shelves in Zone A of the Main warehouse.
   */
  async function story(org: Org) {
    const { agent } = org;
    const main = await createLocation(agent, {
      type: 'site',
      name: 'Main warehouse',
    });
    const zone = await createLocation(agent, {
      type: 'zone',
      name: 'Zone A',
      parentId: main,
    });
    const shelfA2 = await createLocation(agent, {
      type: 'shelf',
      name: 'Shelf A2',
      code: 'A2',
      parentId: zone,
    });
    const shelfB1 = await createLocation(agent, {
      type: 'shelf',
      name: 'Shelf B1',
      code: 'B1',
      parentId: zone,
    });
    const { product } = body<{
      product: { id: string; variants: { id: string }[] };
    }>(
      await agent
        .post('/v1/products')
        .send({
          type: 'material',
          name: 'Vitamin C',
          variant: { sku: 'VITC-90', unitOfMeasure: 'kg', tracksLots: true },
        })
        .expect(201),
    );
    const variantId = product.variants[0].id;
    await receive(agent, variantId, shelfA2, '10', {
      code: 'VC-0302',
      expiresAt: '2027-03-14',
    });
    await agent
      .patch(`/v1/products/${product.id}/variants/${variantId}`)
      .send({ sku: 'VITC-100' })
      .expect(204);
    const [{ lotId }] = await db
      .select({ lotId: stockMovements.lotId })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, variantId));
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId,
        lotId,
        fromLocationId: shelfA2,
        toLocationId: shelfB1,
        quantity: '4',
        reason: 'transfer',
        note: 'Moved for the count',
      })
      .expect(201);

    return { productId: product.id, variantId, lotId, shelfA2, shelfB1 };
  }

  it('lists each movement as one row: today’s code and the one it was recorded under, the lot, each place by its path', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { productId, variantId, lotId, shelfA2, shelfB1 } =
      await story(alpha);

    const item = {
      variantId,
      productId,
      currentSku: 'VITC-100',
      productName: 'Vitamin C',
      variantName: null,
      type: 'material',
      unitOfMeasure: 'kg',
      lotId,
      lotCode: 'VC-0302',
      lotExpiresAt: '2027-03-14',
      actorName: 'Owner',
      document: null,
    };
    const zoneA = ['Main warehouse', 'Zone A'];
    expect((await list(alpha.agent)).entries).toEqual([
      expect.objectContaining({
        ...item,
        sku: 'VITC-100',
        quantity: '4.0000',
        reason: 'transfer',
        fromLocationId: shelfA2,
        fromLocationName: 'Shelf A2',
        fromLocationCode: 'A2',
        fromLocationPath: zoneA,
        toLocationId: shelfB1,
        toLocationName: 'Shelf B1',
        toLocationCode: 'B1',
        toLocationPath: zoneA,
      }),
      // Recorded before the code was corrected: it keeps what it was.
      expect.objectContaining({
        ...item,
        sku: 'VITC-90',
        quantity: '10.0000',
        reason: 'receipt',
        fromLocationId: null,
        fromLocationName: null,
        fromLocationCode: null,
        fromLocationPath: [],
        toLocationId: shelfA2,
        toLocationName: 'Shelf A2',
        toLocationCode: 'A2',
        toLocationPath: zoneA,
      }),
    ]);
  });

  // 133b: one code by its id, for Movements to name a code it filters by
  // when no row and no picker's option does: under stock.view, products'
  // own permission not needed; in the reader's organization alone; a
  // discontinued code, or one of a discontinued item, said so.
  it('reads one code by its id, its name, code, unit and whether in use, in its organization alone', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    const { productId, variantId } = await story(alpha);
    await customRole(app, alpha.organizationId, 'Stock reader', ['stock.view']);
    const reader = await addMember(
      app,
      alpha,
      'reader@example.com',
      'Stock reader',
    );
    const code = async () =>
      body<{ isActive: boolean }>(
        await reader.get(`/v1/stock/variants/${variantId}`).expect(200),
      );

    expect(await code()).toEqual({
      id: variantId,
      sku: 'VITC-100',
      productName: 'Vitamin C',
      variantName: null,
      unitOfMeasure: 'kg',
      isActive: true,
    });
    // Another organization's id is simply not found.
    await beta.agent.get(`/v1/stock/variants/${variantId}`).expect(404);

    await alpha.agent
      .post(`/v1/products/${productId}/variants`)
      .send({ sku: 'VITC-250' })
      .expect(201);
    await alpha.agent
      .patch(`/v1/products/${productId}/variants/${variantId}`)
      .send({ isActive: false })
      .expect(204);
    expect((await code()).isActive).toBe(false);

    await alpha.agent
      .patch(`/v1/products/${productId}/variants/${variantId}`)
      .send({ isActive: true })
      .expect(204);
    await alpha.agent
      .patch(`/v1/products/${productId}`)
      .send({ isActive: false })
      .expect(204);
    expect((await code()).isActive).toBe(false);
  });

  // ADR-093, 96a: Movements names a place only to a reader who may see
  // places, as Stock does; its id stays, so a row still reads in, out or
  // between.
  it('names no place to a reader without locations.view, each place’s id kept', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);
    const owners = (await list(alpha.agent)).entries;

    // The Sales template holds stock.view and not locations.view.
    await customRole(
      app,
      alpha.organizationId,
      'Sales',
      ROLE_TEMPLATES.sales.permissions,
    );
    const sales = await addMember(app, alpha, 'sales@example.com', 'Sales');
    const response = await sales.get('/v1/stock/movements').expect(200);

    expect(body<Page>(response).entries).toEqual(
      owners.map((row) => ({
        ...row,
        fromLocationName: null,
        fromLocationCode: null,
        fromLocationPath: [],
        toLocationName: null,
        toLocationCode: null,
        toLocationPath: [],
      })),
    );
    for (const name of ['Shelf', 'Zone A', 'Main warehouse']) {
      expect(response.text).not.toContain(name);
    }
  });

  /**
   * FOCUS, untracked, on one shelf: a purchase of 20 received as 12 and
   * then 8, and 3 received by hand; a sale of 6, shipped as 4 and then 2,
   * the 2 voided, and 1 of the 4 returned.
   */
  async function orders(org: Org) {
    const { agent } = org;
    const shelf = await site(agent, 'SHELF');
    const focus = await item(agent, 'FOCUS');
    const bought = await order(
      agent,
      'purchase',
      await partner(agent, 'Harbour Supply'),
      focus,
      '20',
    );
    await receiveLine(agent, bought, shelf, '12');
    await receiveLine(agent, bought, shelf, '8');
    await receive(agent, focus, shelf, '3');
    const sold = await order(
      agent,
      'sale',
      await partner(agent, 'Lam Herbal'),
      focus,
      '6',
    );
    await ship(agent, sold, shelf, '4');
    const second = body<{ shipment: { id: string } }>(
      await agent
        .post(`/v1/orders/${sold.id}/shipments`)
        .send({
          fromLocationId: shelf,
          lines: [{ lineId: sold.lineId, quantity: '2' }],
        })
        .expect(201),
    ).shipment.id;
    await agent
      .post(`/v1/orders/${sold.id}/shipments/${second}/void`)
      .send({ reason: 'Recorded too early' })
      .expect(204);
    await agent
      .post(`/v1/orders/${sold.id}/returns`)
      .send({
        toLocationId: shelf,
        lines: [{ lineId: sold.lineId, quantity: '1' }],
      })
      .expect(201);
    return { shelf, focus, bought, sold };
  }

  const moved = (rows: Row[]) =>
    rows.map((row) => [row.reason, row.quantity, row.document?.number]);

  // ADR-093, R24: the order's page's All movements of PO-…, and a sale's.
  it('lists an order’s movements alone: a purchase’s receipts, a sale’s shipments, their voids and its returns', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { bought, sold } = await orders(alpha);

    expect(
      moved((await list(alpha.agent, `?orderId=${bought.id}`)).entries),
    ).toEqual([
      ['receipt', '8.0000', bought.number],
      ['receipt', '12.0000', bought.number],
    ]);
    // Newest first: the return, the void's reversal of the second
    // shipment, the second shipment, the first.
    expect(
      moved((await list(alpha.agent, `?orderId=${sold.id}`)).entries),
    ).toEqual([
      ['return', '1.0000', sold.number],
      ['adjustment', '2.0000', sold.number],
      ['shipment', '2.0000', sold.number],
      ['shipment', '4.0000', sold.number],
    ]);
    // With the other filters, as any of them.
    expect(
      moved(
        (await list(alpha.agent, `?orderId=${sold.id}&reason=shipment`))
          .entries,
      ),
    ).toEqual([
      ['shipment', '2.0000', sold.number],
      ['shipment', '4.0000', sold.number],
    ]);

    // Another organization's order is no order here.
    const beta = await registerOrganization(app, 'beta');
    expect((await list(beta.agent, `?orderId=${sold.id}`)).entries).toEqual([]);
  });

  // ADR-093: the answer alone would tell which movements belong to an
  // order the reader may not see, so the filter is refused before any
  // read, in their words; without it, their movements as before.
  it('refuses an order’s movements to a reader without orders.view, on the list and its export', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { sold } = await orders(alpha);
    await customRole(app, alpha.organizationId, 'Counter', [
      'stock.view',
      'locations.view',
    ]);
    const counter = await addMember(
      app,
      alpha,
      'counter@example.com',
      'Counter',
    );

    for (const path of ['/v1/stock/movements', '/v1/stock/movements/export']) {
      const refused = await counter
        .get(`${path}?orderId=${sold.id}`)
        .expect(403);
      expect(body<{ message: string }>(refused).message).toMatch(
        /Counter.*See purchase and sales orders/,
      );
    }
    const theirs = (await list(counter)).entries;
    expect(theirs).toHaveLength(7);
    expect(theirs.every((row) => row.document === null)).toBe(true);
  });

  // ADR-093, 102a: an order's Receipts tab for a reader with orders.view,
  // without stock.view: When, Item, Received, Lot and By, read as
  // Movements lists the order; Where only with locations.view, which
  // Sales has not; a sale has none; another organization's order is 404.
  it('lists a purchase’s receipts under orders.view alone, Where only with locations.view', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { shelf, bought, sold } = await orders(alpha);
    await customRole(app, alpha.organizationId, 'Buyer', ['orders.view']);
    const buyer = await addMember(app, alpha, 'buyer@example.com', 'Buyer');
    await customRole(
      app,
      alpha.organizationId,
      'Sales',
      ROLE_TEMPLATES.sales.permissions,
    );
    const sales = await addMember(app, alpha, 'sales@example.com', 'Sales');

    const owners = body<{ entries: Record<string, unknown>[] }>(
      await alpha.agent.get(`/v1/orders/${bought.id}/receipts`).expect(200),
    ).entries;
    expect(owners).toHaveLength(2);
    // Exactly the tab's fields (ADR-068).
    expect(Object.keys(owners[0]).sort()).toEqual(
      [
        'id',
        'createdAt',
        'productId',
        'sku',
        'currentSku',
        'productName',
        'variantName',
        'type',
        'unitOfMeasure',
        'received',
        'toLocationId',
        'toLocationName',
        'toLocationCode',
        'toLocationPath',
        'lotId',
        'lotCode',
        'lotExpiresAt',
        'actorName',
        'actorEmail',
      ].sort(),
    );
    expect(owners[0]).toMatchObject({
      sku: 'FOCUS',
      currentSku: 'FOCUS',
      unitOfMeasure: 'each',
      received: '8.0000',
      toLocationId: shelf,
      toLocationCode: 'SHELF',
      toLocationPath: [],
      lotId: null,
    });

    for (const reader of [buyer, sales]) {
      const theirs = body<{ entries: Record<string, unknown>[] }>(
        await reader.get(`/v1/orders/${bought.id}/receipts`).expect(200),
      ).entries;
      expect(theirs).toEqual(
        owners.map((row) => ({
          ...row,
          toLocationName: null,
          toLocationCode: null,
          toLocationPath: [],
        })),
      );
    }

    const paged = body<{ entries: { id: string }[]; nextCursor: string }>(
      await buyer.get(`/v1/orders/${bought.id}/receipts?limit=1`).expect(200),
    );
    expect(paged.entries.map((row) => row.id)).toEqual([owners[0].id]);
    const next = body<{ entries: { id: string }[] }>(
      await buyer
        .get(
          `/v1/orders/${bought.id}/receipts?limit=1&before=${paged.nextCursor}`,
        )
        .expect(200),
    );
    expect(next.entries.map((row) => row.id)).toEqual([owners[1].id]);

    expect(
      body<{ entries: unknown[] }>(
        await buyer.get(`/v1/orders/${sold.id}/receipts`).expect(200),
      ).entries,
    ).toEqual([]);
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.get(`/v1/orders/${bought.id}/receipts`).expect(404);
  });

  // ADR-093, R13 (#471's first cause): two movements alike but for their
  // lot, a sale shipped from two lots at once, each says its own.
  it('lists one order’s two movements of one quantity from two lots, each with its own lot, in one order on every page', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const vitc = await item(agent, 'VITC', true);
    await receive(agent, vitc, shelf, '5', {
      code: 'VC-SOON',
      expiresAt: '2027-01-31',
    });
    await receive(agent, vitc, shelf, '5', {
      code: 'VC-LATER',
      expiresAt: '2027-06-30',
    });
    const sold = await order(
      agent,
      'sale',
      await partner(agent, 'Lam Herbal'),
      vitc,
      '10',
    );
    await ship(agent, sold, shelf, '10');

    const rows = (await list(agent, `?orderId=${sold.id}`)).entries;
    expect(
      rows.map((row) => [row.reason, row.quantity, row.lotCode]).sort(),
    ).toEqual([
      ['shipment', '5.0000', 'VC-LATER'],
      ['shipment', '5.0000', 'VC-SOON'],
    ]);
    expect(rows[0].lotId).not.toBe(rows[1].lotId);
    expect(rows[0].document).toEqual(rows[1].document);

    // Recorded together, they share their time; the id keeps them in one
    // order, a page at a time as at once.
    const paged = await everyPage(agent, `&orderId=${sold.id}`, 1);
    expect(paged.map((row) => row.id)).toEqual(rows.map((row) => row.id));
  });

  // ADR-093: newest first by when each was recorded, then by id. An id is
  // made as its row is written, its time when its transaction began, so
  // two transactions at once can give the later movement the earlier id.
  it('lists newest first by when each was recorded, then by id, and pages without repeating or skipping a row', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const focus = await item(agent, 'FOCUS');
    for (const quantity of ['1', '2', '3', '4']) {
      await receive(agent, focus, shelf, quantity);
    }
    const ids = (await list(agent)).entries.map((row) => row.id).reverse();
    // The first recorded, by its id, given the latest time; the second
    // and third one time between, as one transaction's would share it.
    const at = (minute: number) => new Date(Date.UTC(2026, 10, 19, 9, minute));
    for (const [index, minute] of [
      [0, 30],
      [1, 10],
      [2, 10],
      [3, 20],
    ]) {
      await db
        .update(stockMovements)
        .set({ createdAt: at(minute) })
        .where(eq(stockMovements.id, ids[index]));
    }

    const quantities = (rows: Row[]) => rows.map((row) => row.quantity);
    const newestFirst = ['1.0000', '4.0000', '3.0000', '2.0000'];
    expect(quantities((await list(agent)).entries)).toEqual(newestFirst);
    for (const limit of [1, 2, 3]) {
      expect(quantities(await everyPage(agent, '', limit))).toEqual(
        newestFirst,
      );
    }

    // A cursor that is no movement of this organization is no place in
    // the list.
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.get(`/v1/stock/movements?before=${ids[0]}`).expect(400);
  });

  /**
   * FOCUS, untracked, as a stock card reads it (ADR-093, R21 and R34): 20
   * received by hand and 12 on a purchase into SHELF; 5 shipped on a
   * sale, and 3 moved to QUAR, a place not available, in the same minute;
   * 4 issued to a run at LINE and used there; 7 more received. Each is
   * then dated in November 2026, its day the same anywhere from UTC−8 to
   * UTC+8.
   */
  async function stockCard(org: Org) {
    const { agent } = org;
    const shelf = await site(agent, 'SHELF');
    const line = await site(agent, 'LINE');
    const quarantine = await site(agent, 'QUAR', false);
    const focus = await item(agent, 'FOCUS');
    await receive(agent, focus, shelf, '20');
    const bought = await order(
      agent,
      'purchase',
      await partner(agent, 'Harbour Supply'),
      focus,
      '15',
    );
    await receiveLine(agent, bought, shelf, '12');
    const sold = await order(
      agent,
      'sale',
      await partner(agent, 'Lam Herbal'),
      focus,
      '6',
    );
    await ship(agent, sold, shelf, '5');
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        fromLocationId: shelf,
        toLocationId: quarantine,
        quantity: '3',
        reason: 'transfer',
      })
      .expect(201);
    const bar = await item(agent, 'BAR');
    const runId = await run(
      agent,
      {
        outputId: bar,
        bomId: await recipe(agent, bar, focus, '2'),
        locationId: line,
        quantityPlanned: '2',
        reference: 'RUN-7',
      },
      shelf,
    );
    await output(agent, runId, '2');
    await agent
      .post(`/v1/production-orders/${runId}/close`)
      .send({})
      .expect(200);
    await receive(agent, focus, shelf, '7');

    const ids = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, focus))
      .orderBy(stockMovements.id);
    const days = [
      '2026-11-02T09:00:00Z',
      '2026-11-05T10:00:00Z',
      // The shipment and the move to QUAR, in one instant.
      '2026-11-10T09:30:00Z',
      '2026-11-10T09:30:00Z',
      '2026-11-12T14:00:00Z',
      '2026-11-15T16:00:00Z',
      '2026-11-18T08:00:00Z',
    ];
    expect(ids).toHaveLength(days.length);
    for (const [index, { id }] of ids.entries()) {
      await db
        .update(stockMovements)
        .set({ createdAt: new Date(days[index]) })
        .where(eq(stockMovements.id, id));
    }
    return { focus, shelf, line, quarantine, bought, sold };
  }

  /** From the 3rd to the 12th of November, at noon UTC either end. */
  const NOVEMBER =
    '&from=2026-11-04T12:00:00.000Z&until=2026-11-13T12:00:00.000Z';

  const card = (rows: Row[]) =>
    rows.map((row) => [
      row.reason,
      row.quantityIn,
      row.quantityOut,
      row.balance,
    ]);

  /**
   * The ledger's own walk, oldest first: each row's balance the one
   * before it, plus its In, less its Out, from `opening`.
   */
  function walks(newestFirst: Row[], opening: number) {
    let balance = opening;
    for (const row of [...newestFirst].reverse()) {
      balance += Number(row.quantityIn ?? 0) - Number(row.quantityOut ?? 0);
      expect(Number(row.balance)).toBe(balance);
    }
    return balance;
  }

  /** On hand as Stock's row reads it, from codeFigures; at a place, there. */
  async function onHand(agent: Agent, variantId: string, locationId?: string) {
    const place = locationId ? `&locationId=${locationId}` : '';
    const { entries } = body<{
      entries: {
        variantId: string;
        onHand: string;
        here: { onHand: string } | null;
      }[];
    }>(
      await agent
        .get(`/v1/stock/by-code?includeEmpty=true${place}`)
        .expect(200),
    );
    const row = entries.find((entry) => entry.variantId === variantId)!;
    return Number(locationId ? row.here!.onHand : row.onHand);
  }

  // ADR-093, R21 and 41a: one code's balance after each movement, worked
  // back from today's on hand; across every place a move between two of
  // its places is neither In nor Out, at a place a move out reads Out.
  it('works each row’s balance back from today’s on hand, across every place and at one, the same on every page and either way', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const { focus, shelf, line } = await stockCard(alpha);

    const every = (await list(agent, `?variantId=${focus}`)).entries;
    expect(card(every)).toEqual([
      ['receipt', '7.0000', null, '30.0000'],
      ['consumption', null, '4.0000', '23.0000'],
      ['transfer', null, null, '27.0000'],
      ['transfer', null, null, '27.0000'],
      ['shipment', null, '5.0000', '27.0000'],
      ['receipt', '12.0000', null, '32.0000'],
      ['receipt', '20.0000', null, '20.0000'],
    ]);
    expect(walks(every, 0)).toBe(await onHand(agent, focus));

    // At SHELF, the moves to QUAR and to the run read Out; LINE's own
    // use is not SHELF's.
    const atShelf = (
      await list(agent, `?variantId=${focus}&locationId=${shelf}`)
    ).entries;
    expect(card(atShelf)).toEqual([
      ['receipt', '7.0000', null, '27.0000'],
      ['transfer', null, '4.0000', '20.0000'],
      ['transfer', null, '3.0000', '24.0000'],
      ['shipment', null, '5.0000', '27.0000'],
      ['receipt', '12.0000', null, '32.0000'],
      ['receipt', '20.0000', null, '20.0000'],
    ]);
    expect(walks(atShelf, 0)).toBe(await onHand(agent, focus, shelf));
    const atLine = (await list(agent, `?variantId=${focus}&locationId=${line}`))
      .entries;
    expect(card(atLine)).toEqual([
      ['consumption', null, '4.0000', '0.0000'],
      ['transfer', '4.0000', null, '4.0000'],
    ]);

    // Each page reads only what moved after it: the same balances a row
    // at a time, newest first and oldest first.
    const balances = (rows: Row[]) =>
      Object.fromEntries(rows.map((row) => [row.id, row.balance]));
    for (const [query, whole] of [
      [`&variantId=${focus}`, every],
      [`&variantId=${focus}&locationId=${shelf}`, atShelf],
    ] as const) {
      for (const limit of [1, 2, 3]) {
        const newest = await everyPage(agent, query, limit);
        expect(newest.map((row) => row.id)).toEqual(whole.map((row) => row.id));
        expect(balances(newest)).toEqual(balances(whole));
        const oldest = await everyPage(agent, `${query}&order=asc`, limit);
        expect(oldest.map((row) => row.id)).toEqual(
          whole.map((row) => row.id).reverse(),
        );
        expect(balances(oldest)).toEqual(balances(whole));
      }
    }

    // Several items keep In and Out, with no balance and no period.
    const all = await list(agent, `?${NOVEMBER.slice(1)}`);
    expect(all.period).toBeNull();
    expect(all.entries.every((row) => row.balance === null)).toBe(true);
  });

  // ADR-093, R34 and 88a: a date range's Opening · In · Out · Closing,
  // Closing = Opening + In − Out, a range ending today closing at today's
  // on hand; with a reason or an order, In and Out with no balance (91a).
  it('gives one code’s date range its opening, In, Out and closing; a reason or an order keeps In and Out alone', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const { focus, shelf, sold } = await stockCard(alpha);

    const holds = (period: Period | null) => {
      const { opening, quantityIn, quantityOut, closing } = period!;
      expect(Number(closing)).toBe(
        Number(opening) + Number(quantityIn) - Number(quantityOut),
      );
    };

    const november = await list(agent, `?variantId=${focus}${NOVEMBER}`);
    expect(card(november.entries)).toEqual([
      ['transfer', null, null, '27.0000'],
      ['transfer', null, null, '27.0000'],
      ['shipment', null, '5.0000', '27.0000'],
      ['receipt', '12.0000', null, '32.0000'],
    ]);
    expect(november.period).toEqual({
      opening: '20.0000',
      quantityIn: '12.0000',
      quantityOut: '5.0000',
      closing: '27.0000',
    });
    holds(november.period);
    // The closing is its newest row's balance, the opening its oldest's
    // before it moved.
    expect(walks(november.entries, 20)).toBe(27);
    // The same on every page.
    const second = await list(
      agent,
      `?variantId=${focus}${NOVEMBER}&limit=2&before=${november.entries[1].id}`,
    );
    expect(second.period).toEqual(november.period);

    const atShelf = await list(
      agent,
      `?variantId=${focus}&locationId=${shelf}${NOVEMBER}`,
    );
    expect(atShelf.period).toEqual({
      opening: '20.0000',
      quantityIn: '12.0000',
      quantityOut: '12.0000',
      closing: '20.0000',
    });

    // Ending today, it closes at today's on hand.
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const toToday = await list(
      agent,
      `?variantId=${focus}&from=2026-11-04T12:00:00.000Z&until=${tomorrow}`,
    );
    holds(toToday.period);
    expect(toToday.period).toMatchObject({ opening: '20.0000' });
    expect(Number(toToday.period!.closing)).toBe(await onHand(agent, focus));

    // A reason leaves movements out: no balance, In and Out kept.
    const shipped = await list(
      agent,
      `?variantId=${focus}&reason=shipment${NOVEMBER}`,
    );
    expect(card(shipped.entries)).toEqual([['shipment', null, '5.0000', null]]);
    expect(shipped.period).toEqual({
      opening: null,
      quantityIn: '0.0000',
      quantityOut: '5.0000',
      closing: null,
    });

    // An order: In and Out, no balance; its items' units differ, so no
    // period without one code.
    const order = await list(agent, `?orderId=${sold.id}${NOVEMBER}`);
    expect(card(order.entries)).toEqual([['shipment', null, '5.0000', null]]);
    expect(order.period).toBeNull();
  });

  // ADR-093, 85a: a lot counts that lot alone, and with a place, that lot
  // at that place.
  it('counts a lot’s balance alone, and that lot at one place', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const quarantine = await site(agent, 'QUAR', false);
    const vitc = await item(agent, 'VITC', true);
    await receive(agent, vitc, shelf, '5', {
      code: 'VC-SOON',
      expiresAt: '2027-01-31',
    });
    await receive(agent, vitc, shelf, '5', {
      code: 'VC-LATER',
      expiresAt: '2027-06-30',
    });
    const [{ lotId: soon }] = await db
      .select({ lotId: stockMovements.lotId })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, vitc))
      .orderBy(stockMovements.id)
      .limit(1);
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: vitc,
        lotId: soon,
        fromLocationId: shelf,
        toLocationId: quarantine,
        quantity: '2',
        reason: 'transfer',
      })
      .expect(201);
    // Earliest expiry first: 3 of VC-SOON from SHELF, then 1 of VC-LATER.
    const sold = await order(
      agent,
      'sale',
      await partner(agent, 'Lam Herbal'),
      vitc,
      '4',
    );
    await ship(agent, sold, shelf, '4');

    const lot = (await list(agent, `?variantId=${vitc}&lotId=${soon}`)).entries;
    expect(card(lot)).toEqual([
      ['shipment', null, '3.0000', '2.0000'],
      ['transfer', null, null, '5.0000'],
      ['receipt', '5.0000', null, '5.0000'],
    ]);
    expect(walks(lot, 0)).toBe(2);
    expect(
      card(
        (
          await list(
            agent,
            `?variantId=${vitc}&lotId=${soon}&locationId=${shelf}`,
          )
        ).entries,
      ),
    ).toEqual([
      ['shipment', null, '3.0000', '0.0000'],
      ['transfer', null, '2.0000', '3.0000'],
      ['receipt', '5.0000', null, '5.0000'],
    ]);
    // The whole code, both lots: the two lots' shipment recorded at once.
    const code = (await list(agent, `?variantId=${vitc}`)).entries;
    expect(code.map((row) => [row.lotCode, row.balance])).toEqual([
      ['VC-LATER', '6.0000'],
      ['VC-SOON', '7.0000'],
      ['VC-SOON', '10.0000'],
      ['VC-LATER', '10.0000'],
      ['VC-SOON', '5.0000'],
    ]);
  });

  /** A CSV's header and its rows, each a list of its fields. */
  function csvOf(text: string) {
    const [header, ...rows] = text
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
      .map((line) => line.split(','));
    return { header, rows };
  }

  // ADR-093, 87a and 88a: the screen's columns, one value to each, oldest
  // first, a range's opening first and its closing last with its In and
  // Out; days the organization's.
  it('exports one code’s stock card oldest first, its opening first and its closing last', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const { focus, bought, sold } = await stockCard(alpha);

    const { header, rows } = csvOf(
      (
        await agent
          .get(`/v1/stock/movements/export?variantId=${focus}${NOVEMBER}`)
          .expect(200)
      ).text,
    );
    expect(header).toEqual([
      'When (UTC time)',
      'Code',
      'Recorded as',
      'Item',
      'In',
      'Out',
      'Moved',
      'Balance',
      'Unit',
      'Reason',
      'Reason code',
      'From',
      'To',
      'Lot',
      'Supplier’s lot',
      'Expiry',
      'For',
      'By',
      'Email',
      'Note',
    ]);
    const line = (when: string, rest: Record<string, string>) =>
      header.map((name, at) => (at === 0 ? when : (rest[name] ?? '')));
    const moved = {
      Code: 'FOCUS',
      Item: 'FOCUS',
      Unit: 'each',
      By: 'Owner',
      Email: alpha.email,
    };
    // A movement's moment to the second, the range's ends its days.
    expect(rows).toEqual([
      line('2026-11-04', { Balance: '20', Reason: 'Opening balance' }),
      line('2026-11-05 10:00:00', {
        ...moved,
        In: '12',
        Balance: '32',
        Reason: 'Received',
        'Reason code': 'receipt',
        From: 'supplier',
        To: 'SHELF (SHELF)',
        For: bought.number,
      }),
      line('2026-11-10 09:30:00', {
        ...moved,
        Out: '5',
        Balance: '27',
        Reason: 'Shipped',
        'Reason code': 'shipment',
        From: 'SHELF (SHELF)',
        To: 'customer',
        For: sold.number,
      }),
      // A move across every place, counted in neither In nor Out: how
      // many moved in Moved alone (118a, 114).
      line('2026-11-10 09:30:00', {
        ...moved,
        Moved: '3',
        Balance: '27',
        Reason: 'Moved',
        'Reason code': 'transfer',
        From: 'SHELF (SHELF)',
        To: 'QUAR (QUAR)',
      }),
      line('2026-11-12 14:00:00', {
        ...moved,
        Moved: '4',
        Balance: '27',
        Reason: 'Moved',
        'Reason code': 'transfer',
        From: 'SHELF (SHELF)',
        To: 'LINE (LINE)',
        For: 'RUN-7',
      }),
      line('2026-11-13', {
        In: '12',
        Out: '5',
        Balance: '27',
        Reason: 'Closing balance',
      }),
    ]);

    // Several items: each row's change, a move within its quantity alone;
    // every quantity without its padding zeros, a minus kept (R30).
    const every = csvOf(
      (
        await agent
          .get(`/v1/stock/movements/export?${NOVEMBER.slice(1)}`)
          .expect(200)
      ).text,
    );
    expect(every.header.slice(4, 6)).toEqual(['Change', 'Unit']);
    expect(every.rows.map((row) => [row[4], row[6]])).toEqual([
      ['12', 'Received'],
      ['-5', 'Shipped'],
      ['3', 'Moved'],
      ['4', 'Moved'],
    ]);
  });

  // ADR-093, 96a: the export reads as the list does for its reader: no
  // From or To column without locations.view, For only by orders.view and
  // production.view.
  it('exports what the reader may see: no From or To for Sales, a run’s For empty', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { focus, bought, sold } = await stockCard(alpha);
    await customRole(
      app,
      alpha.organizationId,
      'Sales',
      ROLE_TEMPLATES.sales.permissions,
    );
    const sales = await addMember(app, alpha, 'sales@example.com', 'Sales');

    const response = await sales
      .get(`/v1/stock/movements/export?variantId=${focus}${NOVEMBER}`)
      .expect(200);
    const { header, rows } = csvOf(response.text);
    expect(header).toEqual([
      'When (UTC time)',
      'Code',
      'Recorded as',
      'Item',
      'In',
      'Out',
      'Moved',
      'Balance',
      'Unit',
      'Reason',
      'Reason code',
      'Lot',
      'Supplier’s lot',
      'Expiry',
      'For',
      'By',
      'Email',
      'Note',
    ]);
    const column = (name: string) =>
      rows.map((row) => row[header.indexOf(name)]);
    expect(column('Reason')).toEqual([
      'Opening balance',
      'Received',
      'Shipped',
      'Moved',
      'Moved',
      'Closing balance',
    ]);
    // The shipment's sale by orders.view; the run's, not without
    // production.view; the purchase's, by orders.view.
    expect(column('For')).toEqual(['', bought.number, sold.number, '', '', '']);
    for (const name of ['SHELF', 'QUAR', 'LINE', 'RUN-7']) {
      expect(response.text).not.toContain(name);
    }
  });

  // 125: a sample reads like a shipment. Its To is "sample", never blank,
  // and its For the recipient Send sample recorded, by partners.view,
  // on the list and in its export; none recorded, none named.
  it('ends a sample at “sample” and names its recipient for a reader who may see partners, on the list and in its export', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const focus = await item(agent, 'FOCUS');
    const northside = await partner(agent, 'Northside Pharmacy');
    await receive(agent, focus, shelf, '20');
    for (const recipient of [{ recipientPartnerId: northside }, {}]) {
      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: focus,
          fromLocationId: shelf,
          quantity: '2',
          reason: 'sample',
          ...recipient,
        })
        .expect(201);
    }
    await customRole(
      app,
      alpha.organizationId,
      'Warehouse',
      ROLE_TEMPLATES.warehouse.permissions,
    );
    const warehouse = await addMember(
      app,
      alpha,
      'warehouse@example.com',
      'Warehouse',
    );

    const recipients = async (reader: Agent) =>
      (await list(reader, '?order=asc')).entries.map((row) => [
        row.reason,
        row.recipient,
      ]);
    expect(await recipients(agent)).toEqual([
      ['receipt', null],
      ['sample', { id: northside, name: 'Northside Pharmacy' }],
      ['sample', null],
    ]);
    expect(await recipients(warehouse)).toEqual([
      ['receipt', null],
      ['sample', null],
      ['sample', null],
    ]);

    const columns = async (reader: Agent) => {
      const { header, rows } = csvOf(
        (await reader.get('/v1/stock/movements/export').expect(200)).text,
      );
      return ['To', 'For'].map((name) => [
        name,
        ...rows.map((row) => row[header.indexOf(name)]),
      ]);
    };
    expect(await columns(agent)).toEqual([
      ['To', 'SHELF (SHELF)', 'sample', 'sample'],
      ['For', '', 'Northside Pharmacy', ''],
    ]);
    expect(await columns(warehouse)).toEqual([
      ['To', 'SHELF (SHELF)', 'sample', 'sample'],
      ['For', '', '', ''],
    ]);
  });

  // ADR-093, 100a; review 26: the export's Reason in the screen's words,
  // a correction's detail after a colon, and an end outside the warehouse
  // in the screen's grey words, never blank; in the reader's language.
  it('exports each reason in the screen’s words with its detail, and an end outside the warehouse in words', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const focus = await item(agent, 'FOCUS');
    await receive(agent, focus, shelf, '20');
    for (const [reasonDetail, end] of [
      ['found', { toLocationId: shelf }],
      ['damaged', { fromLocationId: shelf }],
    ] as const) {
      await agent
        .post('/v1/stock/movements')
        .send({
          variantId: focus,
          ...end,
          quantity: '2',
          reason: 'adjustment',
          reasonDetail,
          note: 'Counted on Monday',
        })
        .expect(201);
    }

    const columns = async (language: string) => {
      const { header, rows } = csvOf(
        (
          await agent
            .get('/v1/stock/movements/export')
            .set('Accept-Language', language)
            .expect(200)
        ).text,
      );
      return [4, 6, 8, 9].map((at) => [
        header[at],
        ...rows.map((row) => row[at]),
      ]);
    };
    expect(await columns('en')).toEqual([
      ['Change', '20', '2', '-2'],
      ['Reason', 'Received', 'Corrected: found', 'Corrected: damaged'],
      ['From', 'supplier', 'counted in', 'SHELF (SHELF)'],
      ['To', 'SHELF (SHELF)', 'SHELF (SHELF)', 'counted out'],
    ]);
    // Each reason with its capital, its detail after it in lower case,
    // in French too (136a).
    expect((await columns('fr-CA'))[1]).toEqual([
      'Motif',
      'Reçu',
      'Corrigé\u00A0: trouvé',
      'Corrigé\u00A0: endommagé',
    ]);
    expect((await columns('zh-Hans')).slice(1)).toEqual([
      ['原因', '收货', '调整：盘盈', '调整：损坏'],
      ['从', '供应商', '盘点计入', 'SHELF (SHELF)'],
      ['到', 'SHELF (SHELF)', 'SHELF (SHELF)', '盘点扣除'],
    ]);
  });

  // 138b: after Reason, the reason's own code, never translated, so
  // exports in two languages can be put together.
  it('exports each reason’s code after its words, the same in every language', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const back = await site(agent, 'BACK');
    const focus = await item(agent, 'FOCUS');
    await receive(agent, focus, shelf, '20');
    for (const movement of [
      { fromLocationId: shelf, toLocationId: back, reason: 'transfer' },
      {
        toLocationId: shelf,
        reason: 'adjustment',
        reasonDetail: 'found',
        note: 'Counted on Monday',
      },
      { fromLocationId: back, reason: 'sample' },
    ]) {
      await agent
        .post('/v1/stock/movements')
        .send({ variantId: focus, quantity: '2', ...movement })
        .expect(201);
    }

    // Reason and Reason code, in a language: the header, then each row.
    const reasons = async (language: string) => {
      const { header, rows } = csvOf(
        (
          await agent
            .get('/v1/stock/movements/export')
            .set('Accept-Language', language)
            .expect(200)
        ).text,
      );
      return [header, ...rows].map((row) => row.slice(6, 8));
    };
    const english = await reasons('en');
    expect(english).toEqual([
      ['Reason', 'Reason code'],
      ['Received', 'receipt'],
      ['Moved', 'transfer'],
      ['Corrected: found', 'adjustment'],
      ['Sampled', 'sample'],
    ]);
    const chinese = await reasons('zh-Hans');
    expect(chinese).toEqual([
      ['原因', '原因代码'],
      ['收货', 'receipt'],
      ['移库', 'transfer'],
      ['调整：盘盈', 'adjustment'],
      ['样品', 'sample'],
    ]);
    // The same movements, the same codes.
    const codes = (table: string[][]) => table.slice(1).map(([, code]) => code);
    expect(codes(chinese)).toEqual(codes(english));
    expect((await reasons('fr-CA'))[0]).toEqual(['Motif', 'Code du motif']);
  });

  // ADR-093, 98a and 116; review 54: what main's export had, back. When
  // to the second on the organization's clock, its header naming the
  // place its zone is named for, not ICU's seasonal name; beside Code,
  // the code a row was recorded under where it differs from today's;
  // By's email (ADR-063); the note last, as typed.
  it('exports when to the second in the organization’s zone, the code a row was recorded under, By’s email and the note', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    await agent
      .patch('/v1/organization')
      .send({ timeZone: 'America/Vancouver' })
      .expect(204);
    const { variantId } = await story(alpha);
    // Vancouver stays on UTC−7: the receipt at 02:30 there, the move just
    // after its midnight.
    const ids = await db
      .select({ id: stockMovements.id })
      .from(stockMovements)
      .where(eq(stockMovements.variantId, variantId))
      .orderBy(stockMovements.id);
    for (const [index, at] of [
      '2026-11-10T09:30:00Z',
      '2026-11-11T07:00:09Z',
    ].entries()) {
      await db
        .update(stockMovements)
        .set({ createdAt: new Date(at) })
        .where(eq(stockMovements.id, ids[index].id));
    }

    const exported = async (language: string) =>
      csvOf(
        (
          await agent
            .get(`/v1/stock/movements/export?variantId=${variantId}`)
            .set('Accept-Language', language)
            .expect(200)
        ).text,
      );
    const { header, rows } = await exported('en');
    expect(header).toEqual([
      'When (Vancouver time)',
      'Code',
      'Recorded as',
      'Item',
      'In',
      'Out',
      'Moved',
      'Balance',
      'Unit',
      'Reason',
      'Reason code',
      'From',
      'To',
      'Lot',
      'Supplier’s lot',
      'Expiry',
      'For',
      'By',
      'Email',
      'Note',
    ]);
    const column = (name: string) =>
      rows.map((row) => row[header.indexOf(name)]);
    expect(column('When (Vancouver time)')).toEqual([
      '2026-11-10 02:30:00',
      '2026-11-11 00:00:09',
    ]);
    expect(column('Code')).toEqual(['VITC-100', 'VITC-100']);
    expect(column('Recorded as')).toEqual(['VITC-90', '']);
    expect(column('By')).toEqual(['Owner', 'Owner']);
    expect(column('Email')).toEqual([alpha.email, alpha.email]);
    expect(column('Note')).toEqual(['', 'Moved for the count']);

    expect((await exported('fr-CA')).header[0]).toBe(
      'Quand (fuseau horaire\u00A0: Vancouver)',
    );
    // In Chinese the city in Chinese, by ICU's name for the zone (134b).
    expect((await exported('zh-Hans')).header[0]).toBe('时间（温哥华时间）');
  });

  // ADR-093, 11a and 85a; review 24: each row's change, signed by the
  // server as the list counts it, which the screen and the export both
  // read, so the two never differ. With a place chosen, a move off it is
  // Out there; across every place, neither, its quantity alone.
  it('signs a move off the place chosen with its minus, the same on the list and in its export', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const { agent } = alpha;
    const shelf = await site(agent, 'SHELF');
    const back = await site(agent, 'BACK');
    const focus = await item(agent, 'FOCUS');
    await receive(agent, focus, shelf, '20');
    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        fromLocationId: shelf,
        toLocationId: back,
        quantity: '12',
        reason: 'transfer',
      })
      .expect(201);

    const changes = (rows: Row[]) =>
      rows.map((row) => [row.reason, row.change]);
    expect(
      changes((await list(agent, `?locationId=${shelf}`)).entries),
    ).toEqual([
      ['transfer', '-12.0000'],
      ['receipt', '20.0000'],
    ]);
    expect(changes((await list(agent, `?locationId=${back}`)).entries)).toEqual(
      [['transfer', '12.0000']],
    );
    expect(changes((await list(agent)).entries)).toEqual([
      ['transfer', null],
      ['receipt', '20.0000'],
    ]);

    // The export, oldest first: the same change, without padding zeros.
    const changeIn = async (query: string) => {
      const { header, rows } = csvOf(
        (await agent.get(`/v1/stock/movements/export${query}`).expect(200))
          .text,
      );
      return rows.map((row) => row[header.indexOf('Change')]);
    };
    expect(await changeIn(`?locationId=${shelf}`)).toEqual(['20', '-12']);
    expect(await changeIn(`?locationId=${back}`)).toEqual(['12']);
    expect(await changeIn('')).toEqual(['20', '12']);
  });
});
