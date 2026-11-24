import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import { readableQuantity } from '../src/common/readable-quantity';
import { ROLE_TEMPLATES } from '../src/core/authorization/permissions';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { lots, productVariants, stockMovements } from '../src/database/schema';
import {
  addMember,
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  customRole,
  registerOrganization,
} from './utils/fixtures';
import { order } from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';

interface Trace {
  lot: {
    id: string;
    code: string;
    sku: string;
    variantId: string;
    productId: string;
  };
  balances: {
    locationId: string;
    locationName: string | null;
    locationCode: string | null;
    locationPath: string[];
    isAvailable: boolean;
    quantity: string;
  }[];
  usable: string;
  notUsable: string;
  movedOnTo: {
    lotId: string;
    code: string;
    balances: Trace['balances'];
    usable: string;
    notUsable: string;
  }[];
  sources: {
    kind: 'receipt' | 'production' | 'lot_change';
    reasonDetail: string | null;
    quantity: string;
    orderId: string | null;
    partnerId: string | null;
    supplierName: string | null;
    fromLotId: string | null;
    fromLotCode: string | null;
    runReference: string | null;
  }[];
  madeFrom: { code: string; depth: number; runReference: string | null }[];
  wentInto: { code: string; depth: number; runReference: string | null }[];
  recipients: {
    partnerName: string | null;
    lotCode: string;
    lotSupplierLot: string | null;
    lotIsAssigned: boolean;
    shipped: string;
    sampled: string;
    returned: string;
  }[];
}

interface OrderResponse {
  id: string;
  lines: { id: string }[];
}

/**
 * The recall question, end to end (ADR-044). An ingredient lot is bought from
 * a supplier, blended into a batch, and the batch goes to a customer, a
 * prospect's sample, and somewhere unrecorded — then some comes back. Tracing
 * the ingredient must reach every one of them; tracing the batch must reach
 * back to the supplier.
 */
describe('Lot trace (e2e)', () => {
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

  async function created<T>(
    request: ReturnType<Org['agent']['post']>,
  ): Promise<T> {
    return body<T>(await request.expect(201));
  }

  async function lotId(code: string) {
    const [lot] = await db.select().from(lots).where(eq(lots.code, code));
    return lot.id;
  }

  async function story(org: Org) {
    const { agent } = org;

    const shelf = (
      await created<{ location: { id: string } }>(
        agent.post('/v1/locations').send({ type: 'site', name: 'Shelf' }),
      )
    ).location.id;

    const partner = async (name: string, code: string) =>
      (
        await created<{ partner: { id: string } }>(
          agent.post('/v1/partners').send({ name, code }),
        )
      ).partner.id;

    const supplier = await partner('Herb Supply Co', 'HERB');
    const customer = await partner('Northside Pharmacy', 'NORTH');
    const prospect = await partner('Prospect Health', 'PROS');

    const variant = async (sku: string, type: string) =>
      (
        await created<{ product: { variants: { id: string }[] } }>(
          agent.post('/v1/products').send({
            type,
            name: sku,
            variant: { sku, tracksLots: true },
          }),
        )
      ).product.variants[0].id;

    const blend = await variant('BLEND', 'material');
    const focus = await variant('FOCUS', 'good');

    // Bought from a supplier, received into lot BF-1.
    const purchase = (
      await created<{ order: OrderResponse }>(
        agent.post('/v1/orders').send({
          partnerId: supplier,
          direction: 'purchase',
          reference: 'PO-1',
          lines: [{ variantId: blend, quantityOrdered: '100' }],
        }),
      )
    ).order;
    await agent
      .patch(`/v1/orders/${purchase.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await agent
      .post(`/v1/orders/${purchase.id}/lines/${purchase.lines[0].id}/receipts`)
      .send({ toLocationId: shelf, quantity: '100', lot: { code: 'BF-1' } })
      .expect(201);

    // Blended into batch FOC-1, in place on the shelf.
    const bom = (
      await created<{ bom: { id: string } }>(
        agent.post('/v1/boms').send({
          outputVariantId: focus,
          outputQuantity: '10',
          lines: [{ componentVariantId: blend, quantity: '5' }],
        }),
      )
    ).bom.id;
    await agent.post(`/v1/boms/${bom}/promote`).expect(204);

    const run = (
      await created<{ productionOrder: { id: string } }>(
        agent.post('/v1/production-orders').send({
          outputVariantId: focus,
          bomId: bom,
          locationId: shelf,
          quantityPlanned: '100',
          reference: 'RUN-1',
        }),
      )
    ).productionOrder.id;
    await agent
      .post(`/v1/production-orders/${run}/release`)
      .send({ sourceLocationId: shelf })
      .expect(200);
    await agent
      .post(`/v1/production-orders/${run}/output`)
      .send({ quantity: '100', lot: { code: 'FOC-1' } })
      .expect(201);
    await agent.post(`/v1/production-orders/${run}/close`).send({}).expect(200);

    // Out: sold to a customer, sampled to a prospect, shipped with no order.
    const sale = (
      await created<{ order: OrderResponse }>(
        agent.post('/v1/orders').send({
          partnerId: customer,
          direction: 'sale',
          reference: 'SO-1',
          lines: [
            {
              variantId: focus,
              quantityOrdered: '30',
              unitPrice: '10',
              currency: 'CAD',
            },
          ],
        }),
      )
    ).order;
    await agent
      .patch(`/v1/orders/${sale.id}`)
      .send({ status: 'confirmed' })
      .expect(204);
    await agent
      .post(`/v1/orders/${sale.id}/shipments`)
      .send({
        fromLocationId: shelf,
        lines: [{ lineId: sale.lines[0].id, quantity: '30' }],
      })
      .expect(201);

    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        lotId: await lotId('FOC-1'),
        fromLocationId: shelf,
        quantity: '2',
        reason: 'sample',
        recipientPartnerId: prospect,
      })
      .expect(201);

    await agent
      .post('/v1/stock/movements')
      .send({
        variantId: focus,
        lotId: await lotId('FOC-1'),
        fromLocationId: shelf,
        quantity: '5',
        reason: 'shipment',
      })
      .expect(201);

    // Some comes back.
    await agent
      .post(`/v1/orders/${sale.id}/returns`)
      .send({
        toLocationId: shelf,
        lines: [
          {
            lineId: sale.lines[0].id,
            lots: [{ lotId: await lotId('FOC-1'), quantity: '4' }],
          },
        ],
      })
      .expect(201);
  }

  async function trace(org: Org, code: string) {
    return body<Trace>(
      await org.agent
        .get(`/v1/stock/lots/${await lotId(code)}/trace`)
        .expect(200),
    );
  }

  it('follows an ingredient through the batch to everyone who received it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);

    const found = await trace(alpha, 'BF-1');

    expect(found.lot).toMatchObject({ code: 'BF-1', sku: 'BLEND' });
    expect(found.sources).toMatchObject([
      { kind: 'receipt', supplierName: 'Herb Supply Co' },
    ]);
    expect(found.wentInto).toMatchObject([{ code: 'FOC-1', depth: 1 }]);

    // The ingredient's own movements never name a customer; the batch's do.
    const byWho = found.recipients.map((row) => [
      row.partnerName,
      row.lotCode,
      row.shipped,
      row.sampled,
      row.returned,
    ]);
    expect(byWho).toEqual([
      ['Northside Pharmacy', 'FOC-1', '30.0000', '0', '4.0000'],
      ['Prospect Health', 'FOC-1', '0', '2.0000', '0'],
      // Shipped with no order: kept, with nobody to name.
      [null, 'FOC-1', '5.0000', '0', '0'],
    ]);
  });

  // Review 6: a lot's page links to its item and to its movements.
  it('carries its item’s variant and product, for the links to them', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);

    const found = await trace(alpha, 'BF-1');
    const [lot] = await db.select().from(lots).where(eq(lots.code, 'BF-1'));
    const [variant] = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.id, lot.variantId));

    expect(found.lot).toMatchObject({
      variantId: lot.variantId,
      productId: variant.productId,
    });
  });

  it('follows a batch back to the supplier of what went into it', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);

    const found = await trace(alpha, 'FOC-1');

    expect(found.sources).toMatchObject([
      { kind: 'production', runReference: 'RUN-1' },
    ]);
    expect(found.madeFrom).toMatchObject([{ code: 'BF-1', depth: 1 }]);
    expect(found.wentInto).toEqual([]);

    // 100 made, 30 shipped, 2 sampled, 5 shipped unrecorded, 4 back.
    expect(found.balances).toEqual([
      expect.objectContaining({ locationName: 'Shelf', quantity: '67.0000' }),
    ]);
  });

  // A recall arrives as a code off a label; the start of it is enough.
  it('finds a lot by the start of its code', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);

    const found = body<{ code: string; sku: string }[]>(
      await alpha.agent.get('/v1/stock/lots/search?code=foc').expect(200),
    );

    expect(found).toEqual([
      expect.objectContaining({ code: 'FOC-1', sku: 'FOCUS' }),
    ]);
  });

  // What people remember is often the middle: a batch number, a date.
  it('finds a lot by any part of its code', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);

    const found = body<{ code: string }[]>(
      await alpha.agent.get('/v1/stock/lots/search?code=oc-').expect(200),
    );

    expect(found.map((lot) => lot.code)).toEqual(['FOC-1']);
  });

  // A supplier's letter names its own lot, which a code made here keeps
  // beside ours: either finds the lot, any part of it, capitals aside,
  // the start of either first (ADR-044, amended; #308's 37).
  it('finds a lot by any part of its code or its supplier’s lot, the start of either first (ADR-094, R6)', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const shelf = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Shelf',
    });
    const calm = await createVariant(alpha.agent, {
      type: 'good',
      name: 'Calm',
      variant: { sku: 'CALM-30', tracksLots: true },
    });
    const receive = async (lot: Record<string, unknown>) =>
      body<{ lotCode: string }>(
        await alpha.agent
          .post('/v1/stock/movements')
          .send({
            variantId: calm,
            toLocationId: shelf,
            quantity: '5',
            reason: 'receipt',
            lot,
          })
          .expect(201),
      ).lotCode;

    const typed = await receive({ code: 'ZZ-AB-77' });
    const made = await receive({ makeCode: true, supplierLot: 'ab-7731' });
    const codes = async (code: string) =>
      body<{ code: string; sku: string }[]>(
        await alpha.agent
          .get(`/v1/stock/lots/search?code=${encodeURIComponent(code)}`)
          .expect(200),
      ).map((lot) => `${lot.code} ${lot.sku}`);

    // The start of the supplier's lot before the middle of a code.
    expect(await codes('AB-77')).toEqual([
      `${made} CALM-30`,
      `${typed} CALM-30`,
    ]);
    expect(await codes('7731')).toEqual([`${made} CALM-30`]);
    // Our own code still finds it; % matches itself, not everything.
    expect(await codes(made)).toEqual([`${made} CALM-30`]);
    expect(await codes('%')).toEqual([]);

    // Each match names its supplier's lot and whether its code was made
    // here, so one found by the supplier's lot says why (S10).
    expect(
      body<{ code: string; supplierLot: string | null; isAssigned: boolean }[]>(
        await alpha.agent.get('/v1/stock/lots/search?code=AB-77').expect(200),
      ).map((lot) => [lot.code, lot.supplierLot, lot.isAssigned]),
    ).toEqual([
      [made, 'ab-7731', true],
      [typed, null, false],
    ]);
  });

  // A recall letter goes to everyone on it (ADR-044, amended; #473's 17).
  it('exports the recall list as Who received it lists it, in the reader’s words', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);
    const id = await lotId('BF-1');

    const lines = async (language: string) =>
      (
        await alpha.agent
          .get(`/v1/stock/lots/${id}/recipients/export`)
          .set('Accept-Language', language)
          .expect(200)
      ).text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(','));

    const chinese = await lines('zh-Hans');
    expect(chinese[0]).toEqual([
      '收货方',
      '订单',
      '批次',
      '供应商批号',
      '编码',
      '已发货',
      '已寄送样品',
      '已退回',
      '日期',
    ]);
    // The trace's rows, in its order, each quantity without its padding
    // zeros (R30); nobody on record said so in words. A code printed by
    // the supplier is its own supplier's lot, so none is written.
    const found = await trace(alpha, 'BF-1');
    expect(chinese.slice(1).map((row) => row.slice(2, 8))).toEqual(
      found.recipients.map((row) => [
        row.lotCode,
        '',
        'FOCUS',
        readableQuantity(row.shipped),
        readableQuantity(row.sampled),
        readableQuantity(row.returned),
      ]),
    );
    expect(chinese.slice(1).map((row) => row[0])).toEqual([
      'Northside Pharmacy',
      'Prospect Health',
      '未记录收货方',
    ]);
    // Each with the day it first left.
    for (const row of chinese.slice(1)) {
      expect(row[8]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }

    const english = await lines('en');
    expect(english[0][0]).toBe('Who');
    expect(english[3][0]).toBe('No recipient recorded');

    // Another organization's lot is not exported.
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.get(`/v1/stock/lots/${id}/recipients/export`).expect(404);
  });

  // Where it is now, by each place's path for a reader who may see
  // places (#639); its ids and figures alone for one who may not, as
  // Stock leaves them out, with its usable and not usable sums from the
  // server (ADR-093, 96a).
  it('names each place where it is now by its path, only to a reader with locations.view', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    await story(alpha);
    const main = await createLocation(alpha.agent, {
      type: 'site',
      name: 'Main warehouse',
    });
    const zone = await createLocation(alpha.agent, {
      type: 'zone',
      name: 'Zone A',
      parentId: main,
    });
    const shelfA2 = await createLocation(alpha.agent, {
      type: 'shelf',
      name: 'Shelf A2',
      code: 'A2',
      parentId: zone,
    });
    const shelf = (await trace(alpha, 'FOC-1')).balances[0].locationId;
    await alpha.agent
      .post('/v1/stock/movements')
      .send({
        lotId: await lotId('FOC-1'),
        variantId: (
          await db.select().from(lots).where(eq(lots.code, 'FOC-1'))
        )[0].variantId,
        fromLocationId: shelf,
        toLocationId: shelfA2,
        quantity: '7',
        reason: 'transfer',
      })
      .expect(201);
    // Shelf A2 held back, as quarantine is: its 7 not usable.
    await alpha.agent
      .patch(`/v1/locations/${shelfA2}`)
      .send({ isAvailable: false })
      .expect(204);

    const owners = await trace(alpha, 'FOC-1');
    expect(owners.balances).toEqual([
      {
        locationId: shelf,
        locationName: 'Shelf',
        locationCode: null,
        locationPath: [],
        isAvailable: true,
        quantity: '60.0000',
      },
      {
        locationId: shelfA2,
        locationName: 'Shelf A2',
        locationCode: 'A2',
        locationPath: ['Main warehouse', 'Zone A'],
        isAvailable: false,
        quantity: '7.0000',
      },
    ]);
    expect(owners).toMatchObject({ usable: '60.0000', notUsable: '7.0000' });

    // The Sales template holds stock.view and not locations.view.
    await customRole(
      app,
      alpha.organizationId,
      'Sales',
      ROLE_TEMPLATES.sales.permissions,
    );
    const sales = await addMember(app, alpha, 'sales@example.com', 'Sales');
    const theirs = body<Trace>(
      await sales
        .get(`/v1/stock/lots/${await lotId('FOC-1')}/trace`)
        .expect(200),
    );
    expect(theirs.balances).toEqual(
      owners.balances.map((balance) => ({
        ...balance,
        locationName: null,
        locationCode: null,
        locationPath: [],
      })),
    );
    // The sums, and the rest of the story, theirs as they are the owner's.
    expect(theirs).toMatchObject({ usable: '60.0000', notUsable: '7.0000' });
    expect(theirs.recipients).toEqual(owners.recipients);

    // Moved back, Shelf A2 has nothing left: no longer where it is, and
    // its row, read with the rest, adds nothing to either sum (review 27).
    await alpha.agent
      .post('/v1/stock/movements')
      .send({
        lotId: await lotId('FOC-1'),
        variantId: (
          await db.select().from(lots).where(eq(lots.code, 'FOC-1'))
        )[0].variantId,
        fromLocationId: shelfA2,
        toLocationId: shelf,
        quantity: '7',
        reason: 'transfer',
      })
      .expect(201);
    const emptied = await trace(alpha, 'FOC-1');
    expect(emptied.balances).toEqual([
      { ...owners.balances[0], quantity: '67.0000' },
    ]);
    expect(emptied.usable).toBe('67.0000');
    expect(Number(emptied.notUsable)).toBe(0);

    // Expired, none of it is usable, wherever it is.
    await db
      .update(lots)
      .set({ expiresAt: '2020-01-31' })
      .where(eq(lots.code, 'FOC-1'));
    expect(await trace(alpha, 'FOC-1')).toMatchObject({
      usable: '0',
      notUsable: '67.0000',
    });
  });

  it('does not trace another organization lot', async () => {
    const alpha = await registerOrganization(app, 'alpha');
    const beta = await registerOrganization(app, 'beta');
    await story(beta);

    await alpha.agent
      .get(`/v1/stock/lots/${await lotId('FOC-1')}/trace`)
      .expect(404);
  });

  /**
   * A move between lots is a joint, as a run is (ADR-094, R21; ADR-044,
   * amended): the same stock under another code. The second lot says
   * where it came from, and the first lot's recall list reaches whoever
   * received the second, each row with the lot it came through.
   */
  describe('a move between lots (ADR-094, R21)', () => {
    /** The rows of a lot's recall list, as exported in English. */
    async function recallList(org: Org, code: string) {
      return (
        await org.agent
          .get(`/v1/stock/lots/${await lotId(code)}/recipients/export`)
          .set('Accept-Language', 'en')
          .expect(200)
      ).text
        .replace(/^\uFEFF/, '')
        .trimEnd()
        .split('\r\n')
        .map((line) => line.split(','));
    }

    /**
     * Part of a lot, at its one place, into another lot of its item: one
     * it has, by its code, or a new one, typed, or made for us when no
     * code is given. The lot it went into.
     */
    async function moveToLot(
      org: Org,
      from: string,
      quantity: string,
      to: { code?: string; supplierLot?: string } = {},
    ) {
      const [existing] = to.code
        ? await db.select().from(lots).where(eq(lots.code, to.code))
        : [];
      const moved = body<{ toLot: { id: string; code: string } }>(
        await org.agent
          .post(`/v1/stock/lots/${await lotId(from)}/lot-changes`)
          .send({
            locationId: (await trace(org, from)).balances[0].locationId,
            quantity,
            note: 'Two runs in one delivery',
            ...(existing
              ? { toLotId: existing.id }
              : {
                  lot: to.code
                    ? { code: to.code }
                    : { makeCode: true, supplierLot: to.supplierLot },
                }),
          })
          .expect(201),
      );
      return moved.toLot;
    }

    /** Sold to a new customer and shipped from the one lot named. */
    async function sellFrom(
      org: Org,
      code: string,
      customerName: string,
      quantity: string,
    ) {
      const found = await trace(org, code);
      const customer = await createPartner(org.agent, { name: customerName });
      const sale = await order(
        org.agent,
        'sale',
        customer,
        found.lot.variantId,
        quantity,
      );
      await org.agent
        .post(`/v1/orders/${sale.id}/shipments`)
        .send({
          fromLocationId: found.balances[0].locationId,
          lines: [
            {
              lineId: sale.lineId,
              quantity,
              lots: [{ lotId: found.lot.id, quantity }],
            },
          ],
        })
        .expect(201);
    }

    it('lists on the first lot’s recall list a customer who received only the second lot, with the lot it came through, on the page and in the export (R21)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await story(alpha);
      await moveToLot(alpha, 'FOC-1', '20', { code: 'FOC-2' });
      await sellFrom(alpha, 'FOC-2', 'Westend Clinic', '6');

      const first = await trace(alpha, 'FOC-1');
      expect(
        first.recipients.map((row) => [
          row.partnerName,
          row.lotCode,
          row.shipped,
        ]),
      ).toEqual([
        ['Northside Pharmacy', 'FOC-1', '30.0000'],
        ['Prospect Health', 'FOC-1', '0'],
        ['Westend Clinic', 'FOC-2', '6.0000'],
        [null, 'FOC-1', '5.0000'],
      ]);
      // Moved, not made: no run lies between the two.
      expect(first.wentInto).toEqual([]);

      // In the export, the same rows: Westend Clinic under FOC-2.
      const exported = await recallList(alpha, 'FOC-1');
      expect(exported.slice(1).map((row) => [row[0], row[2]])).toEqual([
        ['Northside Pharmacy', 'FOC-1'],
        ['Prospect Health', 'FOC-1'],
        ['Westend Clinic', 'FOC-2'],
        ['No recipient recorded', 'FOC-1'],
      ]);

      // The second lot says where it came from, and its recall list is its
      // own: the first lot's customers never received it.
      const second = await trace(alpha, 'FOC-2');
      expect(second.sources).toEqual([
        expect.objectContaining({
          kind: 'lot_change',
          reasonDetail: 'between_lots',
          quantity: '20.0000',
          fromLotId: first.lot.id,
          fromLotCode: 'FOC-1',
          orderId: null,
          partnerId: null,
        }),
      ]);
      expect(second.recipients.map((row) => row.partnerName)).toEqual([
        'Westend Clinic',
      ]);
      // Made from what the first was made from, through the same run.
      expect(second.madeFrom).toEqual([
        expect.objectContaining({
          code: 'BF-1',
          depth: 1,
          runReference: 'RUN-1',
        }),
      ]);

      // The ingredient's recall reaches it too: the batch's stock under
      // another code, as many runs away, through the same run.
      const ingredient = await trace(alpha, 'BF-1');
      expect(
        ingredient.wentInto.map((lot) => [
          lot.code,
          lot.depth,
          lot.runReference,
        ]),
      ).toEqual([
        ['FOC-1', 1, 'RUN-1'],
        ['FOC-2', 1, 'RUN-1'],
      ]);
      expect(
        ingredient.recipients.map((row) => [row.partnerName, row.lotCode]),
      ).toContainEqual(['Westend Clinic', 'FOC-2']);
    });

    it('follows a chain of three moves and a move back, each lot once, the recall list naming each lot’s supplier’s lot (R21)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await story(alpha);
      await moveToLot(alpha, 'FOC-1', '20', { code: 'FOC-2' });
      await moveToLot(alpha, 'FOC-2', '10', { code: 'FOC-3' });
      const made = await moveToLot(alpha, 'FOC-3', '5', {
        supplierLot: 'NL-77',
      });
      // A move back closes a loop the trace must not go round.
      await moveToLot(alpha, 'FOC-3', '1', { code: 'FOC-1' });
      const madeToAdd = await moveToLot(alpha, 'FOC-1', '2', {
        supplierLot: '',
      });
      const westend = await createPartner(alpha.agent, {
        name: 'Westend Clinic',
      });
      const found = await trace(alpha, made.code);
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: found.lot.variantId,
          lotId: made.id,
          fromLocationId: found.balances[0].locationId,
          quantity: '2',
          reason: 'sample',
          recipientPartnerId: westend,
        })
        .expect(201);
      await sellFrom(alpha, madeToAdd.code, 'Eastside Clinic', '1');

      const first = await trace(alpha, 'FOC-1');
      expect(
        first.recipients.map((row) => [
          row.partnerName,
          row.lotCode,
          row.lotSupplierLot,
          row.lotIsAssigned,
          row.sampled,
        ]),
      ).toEqual([
        ['Eastside Clinic', madeToAdd.code, null, true, '0'],
        ['Northside Pharmacy', 'FOC-1', null, false, '0'],
        ['Prospect Health', 'FOC-1', null, false, '2.0000'],
        ['Westend Clinic', made.code, 'NL-77', true, '2.0000'],
        [null, 'FOC-1', null, false, '0'],
      ]);
      // The moved back stock says where it came from beside the run.
      expect(
        first.sources.map((source) => [
          source.kind,
          source.fromLotCode,
          source.quantity,
        ]),
      ).toEqual([
        ['production', null, '100.0000'],
        ['lot_change', 'FOC-3', '1.0000'],
      ]);

      // The recall list writes each lot's supplier's lot after its code:
      // the supplier's, to add for a code made here with none, and none
      // for a code printed by the supplier, its own.
      const exported = await recallList(alpha, 'FOC-1');
      expect(exported[0].slice(2, 4)).toEqual(['Lot', 'Supplier’s lot']);
      expect(exported.slice(1).map((row) => row.slice(2, 4))).toEqual([
        [madeToAdd.code, 'Supplier’s lot to add'],
        ['FOC-1', ''],
        ['FOC-1', ''],
        [made.code, 'NL-77'],
        ['FOC-1', ''],
      ]);

      // Up the chain, every lot once, each through the run that made the
      // first; the last lot made from the ingredient alone.
      const ingredient = await trace(alpha, 'BF-1');
      expect(
        ingredient.wentInto.map((lot) => [
          lot.code,
          lot.depth,
          lot.runReference,
        ]),
      ).toEqual(
        [
          ['FOC-1', 1, 'RUN-1'],
          ['FOC-2', 1, 'RUN-1'],
          ['FOC-3', 1, 'RUN-1'],
          [made.code, 1, 'RUN-1'],
          [madeToAdd.code, 1, 'RUN-1'],
        ].sort((a, b) => String(a[0]).localeCompare(String(b[0]))),
      );
      const last = await trace(alpha, made.code);
      expect(last.madeFrom).toEqual([
        expect.objectContaining({ code: 'BF-1', depth: 1 }),
      ]);
      expect(last.sources).toEqual([
        expect.objectContaining({ kind: 'lot_change', fromLotCode: 'FOC-3' }),
      ]);
    });

    it('says where a start lot came from: the stock on hand when lot tracking started, and stock back from before it (R21, Q4a)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      const shelf = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Shelf',
      });
      const supplier = await createPartner(alpha.agent, { name: 'Zinc Co' });
      const customer = await createPartner(alpha.agent, { name: 'Northside' });
      const code = await createVariant(alpha.agent, {
        type: 'good',
        name: 'Zinc',
        variant: { sku: 'ZINC-50', unitOfMeasure: 'each' },
      });
      const [variant] = await db
        .select()
        .from(productVariants)
        .where(eq(productVariants.id, code));

      const purchase = await order(
        alpha.agent,
        'purchase',
        supplier,
        code,
        '50',
      );
      await alpha.agent
        .post(`/v1/orders/${purchase.id}/lines/${purchase.lineId}/receipts`)
        .send({ toLocationId: shelf, quantity: '50' })
        .expect(201);
      const sale = await order(alpha.agent, 'sale', customer, code, '10');
      await alpha.agent
        .post(`/v1/orders/${sale.id}/shipments`)
        .send({
          fromLocationId: shelf,
          lines: [{ lineId: sale.lineId, quantity: '10' }],
        })
        .expect(201);

      const { lot } = body<{ lot: { id: string; code: string } }>(
        await alpha.agent
          .post(
            `/v1/products/${variant.productId}/variants/${code}/lot-tracking`,
          )
          .send({})
          .expect(201),
      );
      await alpha.agent
        .post(`/v1/orders/${sale.id}/returns`)
        .send({
          toLocationId: shelf,
          lines: [{ lineId: sale.lineId, quantity: '3' }],
        })
        .expect(201);

      const found = await trace(alpha, lot.code);
      expect(found.sources).toEqual([
        expect.objectContaining({
          kind: 'lot_change',
          reasonDetail: 'lots_started',
          quantity: '40.0000',
          fromLotId: null,
          fromLotCode: null,
        }),
        expect.objectContaining({
          kind: 'lot_change',
          reasonDetail: 'from_before',
          quantity: '3.0000',
          fromLotId: null,
          fromLotCode: null,
        }),
      ]);
      // Nothing lies upstream of stock that had no lot.
      expect(found.madeFrom).toEqual([]);
    });

    it('names who a receipt with no order came from and why, and an order’s supplier by its partner (ADR-094, E2)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await story(alpha);
      const found = await trace(alpha, 'FOC-1');
      const customer = await createPartner(alpha.agent, {
        name: 'Westend Clinic',
      });
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: found.lot.variantId,
          toLocationId: found.balances[0].locationId,
          quantity: '3',
          reason: 'receipt',
          reasonDetail: 'returned',
          recipientPartnerId: customer,
          lot: { code: 'FOC-R1' },
        })
        .expect(201);

      expect((await trace(alpha, 'FOC-R1')).sources).toEqual([
        expect.objectContaining({
          kind: 'receipt',
          reasonDetail: 'returned',
          quantity: '3.0000',
          orderId: null,
          partnerId: customer,
          supplierName: 'Westend Clinic',
        }),
      ]);
      const [supplier] = (await trace(alpha, 'BF-1')).sources;
      expect(supplier).toMatchObject({
        kind: 'receipt',
        reasonDetail: null,
        supplierName: 'Herb Supply Co',
      });
      expect(supplier.partnerId).toEqual(expect.any(String));
    });

    // Step 15's gap (S9): stock moved on under another code is still on
    // hand somewhere, and a recall reading Where it is now must find it.
    it('lists the lots its stock moved on to, by moves alone and any number of hops, with all each holds now, a place named only with locations.view (S9)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await story(alpha);
      const first = await trace(alpha, 'FOC-1');
      const shelf = first.balances[0].locationId;
      const annex = await createLocation(alpha.agent, {
        type: 'site',
        name: 'Annex',
      });
      // FOC-2 held stock of its own before the move: all of it is listed.
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: first.lot.variantId,
          toLocationId: shelf,
          quantity: '10',
          reason: 'receipt',
          lot: { code: 'FOC-2' },
        })
        .expect(201);
      await moveToLot(alpha, 'FOC-1', '20', { code: 'FOC-2' });
      await moveToLot(alpha, 'FOC-2', '10', { code: 'FOC-3' });
      await alpha.agent
        .post('/v1/stock/movements')
        .send({
          variantId: first.lot.variantId,
          lotId: await lotId('FOC-3'),
          fromLocationId: shelf,
          toLocationId: annex,
          quantity: '4',
          reason: 'transfer',
        })
        .expect(201);
      // A lot moved on to and emptied since: listed, holding nothing.
      const made = await moveToLot(alpha, 'FOC-1', '2');
      await sellFrom(alpha, made.code, 'Eastside Clinic', '2');

      const held = (found: Trace) =>
        found.movedOnTo.map((lot) => [
          lot.code,
          lot.balances.map((row) => [row.locationName, row.quantity]),
          Number(lot.usable),
          Number(lot.notUsable),
        ]);
      const owners = await trace(alpha, 'FOC-1');
      expect(owners.balances.map((row) => row.quantity)).toEqual(['45.0000']);
      expect(held(owners)).toEqual([
        ['FOC-2', [['Shelf', '20.0000']], 20, 0],
        [
          'FOC-3',
          [
            ['Annex', '4.0000'],
            ['Shelf', '6.0000'],
          ],
          10,
          0,
        ],
        [made.code, [], 0, 0],
      ]);
      expect(owners.movedOnTo[2].lotId).toBe(made.id);
      expect(owners.movedOnTo[1].balances[0]).toEqual({
        locationId: annex,
        locationName: 'Annex',
        locationCode: null,
        locationPath: [],
        isAvailable: true,
        quantity: '4.0000',
      });

      // From the second lot, only the lot it moved on to; from the
      // ingredient, none: a lot reached through a run is in Went into.
      expect(held(await trace(alpha, 'FOC-2')).map(([code]) => code)).toEqual([
        'FOC-3',
      ]);
      expect((await trace(alpha, 'BF-1')).movedOnTo).toEqual([]);

      // The Sales template holds stock.view and not locations.view: each
      // place by its id, the sums as the owner's.
      await customRole(
        app,
        alpha.organizationId,
        'Sales',
        ROLE_TEMPLATES.sales.permissions,
      );
      const sales = await addMember(app, alpha, 'sales@example.com', 'Sales');
      const theirs = body<Trace>(
        await sales
          .get(`/v1/stock/lots/${await lotId('FOC-1')}/trace`)
          .expect(200),
      );
      expect(theirs.movedOnTo).toEqual(
        owners.movedOnTo.map((lot) => ({
          ...lot,
          balances: lot.balances.map((row) => ({
            ...row,
            locationName: null,
            locationCode: null,
            locationPath: [],
          })),
        })),
      );
    });

    // #627's recall half and #649's joins: each join names the
    // organization, so a row that names another's lot, order, shipment
    // or partner, as no write here can, joins none of it.
    it('never joins another organization’s lot, order, shipment or partner, whatever a row names (#627, #649)', async () => {
      const alpha = await registerOrganization(app, 'alpha');
      await story(alpha);
      const beta = await registerOrganization(app, 'beta');
      const theirs = {
        shelf: await createLocation(beta.agent, { type: 'site', name: 'Dock' }),
        supplier: await createPartner(beta.agent, { name: 'Beta Supplier' }),
        customer: await createPartner(beta.agent, { name: 'Beta Customer' }),
        code: await createVariant(beta.agent, {
          type: 'good',
          name: 'Beta',
          variant: { sku: 'BETA', unitOfMeasure: 'each', tracksLots: true },
        }),
      };
      const purchase = await order(
        beta.agent,
        'purchase',
        theirs.supplier,
        theirs.code,
        '10',
      );
      await beta.agent
        .post(`/v1/orders/${purchase.id}/lines/${purchase.lineId}/receipts`)
        .send({
          toLocationId: theirs.shelf,
          quantity: '10',
          lot: { code: 'BETA-1' },
        })
        .expect(201);
      const sale = await order(
        beta.agent,
        'sale',
        theirs.customer,
        theirs.code,
        '4',
      );
      const shipment = body<{ shipment: { id: string } }>(
        await beta.agent
          .post(`/v1/orders/${sale.id}/shipments`)
          .send({
            fromLocationId: theirs.shelf,
            lines: [{ lineId: sale.lineId, quantity: '4' }],
          })
          .expect(201),
      ).shipment.id;

      // Alpha's own rows, written past the service, each naming beta's.
      const ours = await trace(alpha, 'FOC-1');
      const shelf = ours.balances[0].locationId;
      const row = {
        organizationId: alpha.organizationId,
        variantId: ours.lot.variantId,
        sku: 'FOCUS',
        quantity: '1',
        actorId: alpha.userId,
      };
      const focus = ours.lot.id;
      const betaLot = await lotId('BETA-1');
      await db.insert(stockMovements).values([
        // A move into beta's lot, and one out of it.
        {
          ...row,
          lotId: focus,
          toLotId: betaLot,
          fromLocationId: shelf,
          toLocationId: shelf,
          reason: 'lot_change',
          reasonDetail: 'between_lots',
        },
        {
          ...row,
          lotId: betaLot,
          toLotId: focus,
          fromLocationId: shelf,
          toLocationId: shelf,
          reason: 'lot_change',
          reasonDetail: 'between_lots',
        },
        // Received on beta's purchase, shipped on beta's shipment.
        {
          ...row,
          lotId: focus,
          toLocationId: shelf,
          reason: 'receipt',
          referenceType: 'purchase_order',
          referenceId: purchase.id,
        },
        {
          ...row,
          lotId: focus,
          fromLocationId: shelf,
          reason: 'shipment',
          referenceType: 'shipment',
          referenceId: shipment,
        },
        // A sample to beta's customer.
        {
          ...row,
          lotId: focus,
          fromLocationId: shelf,
          reason: 'sample',
          referenceType: 'partner',
          referenceId: theirs.customer,
        },
      ]);

      const read = JSON.stringify(await trace(alpha, 'FOC-1'));
      for (const named of [
        betaLot,
        'BETA-1',
        purchase.id,
        sale.id,
        theirs.supplier,
        theirs.customer,
        'Beta Supplier',
        'Beta Customer',
      ]) {
        expect(read).not.toContain(named);
      }
      const exported = JSON.stringify(await recallList(alpha, 'FOC-1'));
      for (const named of ['BETA-1', 'Beta Customer']) {
        expect(exported).not.toContain(named);
      }
      // Nor does the ingredient's, through the batch.
      expect(JSON.stringify(await trace(alpha, 'BF-1'))).not.toContain(
        'Beta Customer',
      );
    });
  });
});
