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
  partner,
  receive,
  receiveLine,
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
}

interface Page {
  entries: Row[];
  nextCursor: string | null;
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
   * A2, its code then corrected to VITC-100, and 4 moved to Shelf B1, both
   * shelves in Zone A of the Main warehouse.
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
});
