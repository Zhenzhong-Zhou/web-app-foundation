import type { INestApplication } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  lots,
  productVariants,
  stockLevels,
  stockMovements,
  stockValuations,
} from '../src/database/schema';
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
import { receive } from './utils/reorder-world';
import { resetDatabase } from './utils/reset-db';
import { said } from './utils/said';
import {
  buy as bought,
  cad,
  expectBooksToReconcile,
  poolOf,
} from './utils/valuation';

type Org = Awaited<ReturnType<typeof registerOrganization>>;
type Agent = Org['agent'];

interface Moved {
  movement: {
    id: string;
    lotId: string | null;
    fromLocationId: string | null;
    toLocationId: string | null;
    quantity: string;
    reason: string;
    reasonDetail: string | null;
    note: string | null;
  };
  fromLot: { id: string; code: string };
  toLot: { id: string; code: string };
  needsCost: boolean;
}

interface Waiting {
  id: string;
  kind: string;
  reason: string | null;
  reasonDetail: string | null;
  lotId: string | null;
  lotCode: string | null;
  fromLotId: string | null;
  fromLotCode: string | null;
  quantity: string;
}

/**
 * Move to another lot (ADR-094, R20): part of a lot at one place into
 * another lot of the same item, one it has or a new one, typed or made for
 * us, under stock.adjust with a note. One lot change, counted in neither In
 * nor Out for the code, its value carried from the first lot's pool into
 * the second's, the stock moved waiting for a cost where the first lot's
 * does (Q1a, 3a).
 */
describe('Move to another lot (e2e)', () => {
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

  afterEach(async () => {
    await expectBooksToReconcile(db);
  });

  /**
   * An organization costing in CAD, two sites, a supplier, and VITC-90, a
   * good tracked by lot.
   */
  async function world(slugish = 'alpha') {
    const org = await registerOrganization(app, slugish);
    await org.agent
      .patch('/v1/organization')
      .send({ baseCurrency: 'CAD' })
      .expect(204);
    const site = (name: string) =>
      createLocation(org.agent, { type: 'site', name, code: name });
    return {
      org,
      code: await createVariant(org.agent, {
        type: 'good',
        name: 'Vitamin C',
        variant: { sku: 'VITC-90', unitOfMeasure: 'each', tracksLots: true },
      }),
      main: await site('Main'),
      annex: await site('Annex'),
      supplier: await createPartner(org.agent, { name: 'Nordic Labs' }),
    };
  }

  type World = Awaited<ReturnType<typeof world>>;

  /** Bought at a price in CAD into a lot typed as printed, at one place. */
  async function buy(
    w: World,
    quantity: string,
    unitPrice: string,
    lot: string,
    at = w.main,
  ) {
    await bought(
      { agent: w.org.agent, supplier: w.supplier, shelf: at },
      w.code,
      quantity,
      cad(unitPrice),
      { code: lot },
    );
    return lotOf(lot);
  }

  async function lotOf(code: string) {
    const [lot] = await db.select().from(lots).where(eq(lots.code, code));
    return lot;
  }

  const path = (lotId: string) => `/v1/stock/lots/${lotId}/lot-changes`;

  async function move(
    w: World,
    lotId: string,
    payload: Record<string, unknown>,
    agent: Agent = w.org.agent,
  ) {
    return body<Moved>(
      await agent
        .post(path(lotId))
        .send({
          locationId: w.main,
          note: 'Two runs in one delivery',
          ...payload,
        })
        .expect(201),
    );
  }

  async function pileOf(lotId: string | null, at: string) {
    const rows = await db
      .select({
        lotId: stockLevels.lotId,
        locationId: stockLevels.locationId,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .where(eq(stockLevels.locationId, at));
    return rows.find((row) => row.lotId === lotId)?.quantity ?? null;
  }

  async function valueRowsOf(movementId: string) {
    const rows = await db
      .select({
        kind: stockValuations.kind,
        lotId: stockValuations.lotId,
        quantity: stockValuations.quantity,
        value: stockValuations.value,
        needsCost: stockValuations.needsCost,
      })
      .from(stockValuations)
      .where(eq(stockValuations.movementId, movementId));
    // The row out first: a sign test, never arithmetic (ADR-025).
    return rows.sort((a) => (a.quantity.startsWith('-') ? -1 : 1));
  }

  /** A lot change's value row in one lot: its row out, or its row in. */
  async function valueRowOf(movementId: string, lotId: string) {
    const rows = await db
      .select({ id: stockValuations.id, lotId: stockValuations.lotId })
      .from(stockValuations)
      .where(eq(stockValuations.movementId, movementId));
    return rows.find((row) => row.lotId === lotId)!;
  }

  async function waiting(w: World) {
    const res = await w.org.agent.get('/v1/costs/needs-cost').expect(200);
    return body<{ entries: Waiting[] }>(res).entries;
  }

  async function figures(w: World) {
    const [variant] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, w.code));
    const { codes } = body<{ codes: Record<string, unknown>[] }>(
      await w.org.agent
        .get(`/v1/products/${variant.productId}/stock`)
        .expect(200),
    );
    const { onHand, usable, held, free, short, coming } = codes[0];
    return { onHand, usable, held, free, short, coming };
  }

  async function total(w: World) {
    const res = await w.org.agent.get('/v1/costs/valuation').expect(200);
    return body<{ valuation: { total: string } }>(res).valuation.total;
  }

  function message(res: Parameters<typeof body>[0]): string {
    return body<{ message: string }>(res).message;
  }

  it('moves part of a lot at one place into another of its lots, its value carried at the first lot’s average, both pools summing, the code’s figures as before (R20, Q1a)', async () => {
    const w = await world();
    const first = await buy(w, '100', '2.00', 'NL-2611-A');
    const second = await buy(w, '40', '3.00', 'NL-2611-B');
    const before = await figures(w);

    const moved = await move(w, first.id, {
      quantity: '30',
      toLotId: second.id,
    });

    expect(moved).toMatchObject({
      movement: {
        lotId: first.id,
        fromLocationId: w.main,
        toLocationId: w.main,
        quantity: '30.0000',
        reason: 'lot_change',
        reasonDetail: 'between_lots',
        note: 'Two runs in one delivery',
      },
      fromLot: { id: first.id, code: 'NL-2611-A' },
      toLot: { id: second.id, code: 'NL-2611-B' },
      needsCost: false,
    });

    // The piles at the place, and both pools: 30 at 2.00 out of the first.
    expect(await pileOf(first.id, w.main)).toBe('70.0000');
    expect(await pileOf(second.id, w.main)).toBe('70.0000');
    expect(await poolOf(db, w.code, first.id)).toMatchObject({
      quantity: '70.0000',
      value: '140.000000',
    });
    expect(await poolOf(db, w.code, second.id)).toMatchObject({
      quantity: '70.0000',
      value: '180.000000',
    });
    expect(await valueRowsOf(moved.movement.id)).toEqual([
      {
        kind: 'lot_change',
        lotId: first.id,
        quantity: '-30.0000',
        value: '-60.000000',
        needsCost: false,
      },
      {
        kind: 'lot_change',
        lotId: second.id,
        quantity: '30.0000',
        value: '60.000000',
        needsCost: false,
      },
    ]);

    // Nothing else moves: Stock value and the code's figures.
    expect(await total(w)).toBe('320.000000');
    expect(await figures(w)).toEqual(before);

    // Who and when, in the Activity log, as every movement is: both lots,
    // the one it went to after the one it left, each a link, its reason
    // as its action (U1).
    const log = await w.org.agent
      .get('/v1/audit')
      .query({ resourceId: moved.movement.id })
      .expect(200);
    const [entry] = body<{
      entries: { action: string; details: unknown[] }[];
    }>(log).entries;
    expect(entry.action).toBe('stock.movement_recorded');
    expect(entry.details).toEqual([
      { field: 'Code', changed: false, from: null, value: { text: 'VITC-90' } },
      {
        field: 'Lot',
        changed: false,
        from: null,
        value: { text: 'NL-2611-A', link: { kind: 'lot', id: first.id } },
      },
      {
        field: 'To lot',
        changed: false,
        from: null,
        value: { text: 'NL-2611-B', link: { kind: 'lot', id: second.id } },
      },
      {
        field: 'Reason',
        changed: false,
        from: null,
        value: { text: 'Moved to another lot' },
      },
    ]);

    // Stock moved takes no cost of its own: its first lot's follows it
    // (ADR-094, D5).
    const rowIn = await valueRowOf(moved.movement.id, second.id);
    const refused = await w.org.agent
      .put(`/v1/costs/valuations/${rowIn.id}`)
      .send({ unitPrice: '9.00', currency: 'CAD' })
      .expect(409);
    expect(message(refused)).toBe(
      said('en', 'stock.stockMovedInFromLot', { code: 'NL-2611-A' }),
    );
  });

  it('makes the new lot, typed or made for us, starting with the first lot’s expiry and supplier’s lot unless given (R20, E7)', async () => {
    const w = await world();
    await receive(w.org.agent, w.code, w.main, '50', {
      makeCode: true,
      supplierLot: 'nl-77/a',
      expiry: 'date',
      expiresAt: '2027-03-31',
    });
    const [first] = await db.select().from(lots);

    // Made for us: the first lot's expiry and supplier's lot.
    const made = await move(w, first.id, {
      quantity: '10',
      lot: { makeCode: true },
    });
    expect(made.toLot.code).toMatch(/^L-\d{4}-\d{2}-\d{2}-2$/);
    expect(await lotOf(made.toLot.code)).toMatchObject({
      isAssigned: true,
      supplierLot: 'nl-77/a',
      expiry: 'date',
      expiresAt: '2027-03-31',
    });

    // Typed as printed: the first lot's expiry, and no supplier's lot,
    // the code being the supplier's own (R5).
    const typed = await move(w, first.id, {
      quantity: '5',
      lot: { code: 'nl-78' },
    });
    expect(typed.toLot.code).toBe('NL-78');
    expect(await lotOf('NL-78')).toMatchObject({
      isAssigned: false,
      supplierLot: null,
      expiry: 'date',
      expiresAt: '2027-03-31',
    });

    // Given: an expiry not known yet, and the supplier's lot to add.
    const given = await move(w, first.id, {
      quantity: '5',
      lot: { makeCode: true, expiry: 'unknown', supplierLot: '' },
    });
    expect(await lotOf(given.toLot.code)).toMatchObject({
      supplierLot: null,
      expiry: 'unknown',
      expiresAt: null,
    });

    // A code the item has is chosen by its id, never typed again.
    const taken = await w.org.agent
      .post(path(first.id))
      .send({
        locationId: w.main,
        quantity: '1',
        lot: { code: 'NL-78' },
        note: 'Another run',
      })
      .expect(409);
    expect(body<{ code: string }>(taken).code).toBe('lot_code_in_use');
    const supplier = await w.org.agent
      .post(path(first.id))
      .send({
        locationId: w.main,
        quantity: '1',
        lot: { code: 'NL-79', supplierLot: 'nl-79' },
        note: 'Another run',
      })
      .expect(400);
    expect(message(supplier)).toBe(said('en', 'stock.supplierLotForMadeCode'));

    expect(await pileOf(first.id, w.main)).toBe('30.0000');
    expect(await db.select().from(lots)).toHaveLength(4);
  });

  it('marks the stock moved as waiting for a cost where some of the first lot’s waits, listed with the lot it came from (R20, 3a)', async () => {
    const w = await world();
    const first = await buy(w, '60', '2.00', 'NL-2611-A');
    // Forty more of the run, received by hand with no price: they wait.
    await receive(w.org.agent, w.code, w.main, '40', { code: 'NL-2611-A' });
    const [receipt] = await waiting(w);

    const moved = await move(w, first.id, {
      quantity: '50',
      lot: { makeCode: true },
    });
    expect(moved.needsCost).toBe(true);

    // Its share of the first pool carried, 50 at 1.20, the row in waiting.
    const [out, into] = await valueRowsOf(moved.movement.id);
    expect(out).toMatchObject({ value: '-60.000000', needsCost: false });
    expect(into).toMatchObject({
      lotId: moved.toLot.id,
      value: '60.000000',
      needsCost: true,
    });

    // Stock value lists it, naming the lot it came from.
    const listed = await waiting(w);
    expect(listed).toEqual([
      expect.objectContaining({
        kind: 'lot_change',
        reason: 'lot_change',
        reasonDetail: 'between_lots',
        lotId: moved.toLot.id,
        lotCode: moved.toLot.code,
        fromLotId: first.id,
        fromLotCode: 'NL-2611-A',
        quantity: '50.0000',
      }),
      expect.objectContaining({
        id: receipt.id,
        kind: 'movement',
        reason: 'receipt',
        reasonDetail: null,
        lotId: first.id,
        fromLotId: null,
        fromLotCode: null,
      }),
    ]);

    // The row out is stock going out, valued at its pool's average.
    const outRow = await valueRowOf(moved.movement.id, first.id);
    const refused = await w.org.agent
      .put(`/v1/costs/valuations/${outRow.id}`)
      .send({ unitPrice: '2.50', currency: 'CAD' })
      .expect(409);
    expect(message(refused)).toBe(said('en', 'stock.stockGoingOutValued'));
  });

  it('reads a lot change’s second lot back on Movements, Out of the first and In to the second, and the other lot in each lot’s cost history (R20)', async () => {
    const w = await world();
    const first = await buy(w, '100', '2.00', 'NL-2611-A');
    const moved = await move(w, first.id, {
      quantity: '30',
      lot: { code: 'NL-2611-B' },
    });
    const second = moved.toLot;

    const entries = async (query: Record<string, string>) =>
      body<{ entries: Record<string, unknown>[] }>(
        await w.org.agent
          .get('/v1/stock/movements')
          .query({ variantId: w.code, ...query })
          .expect(200),
      ).entries;

    const [change] = await entries({ reason: 'lot_change' });
    expect(change).toMatchObject({
      lotId: first.id,
      lotCode: 'NL-2611-A',
      toLotId: second.id,
      toLotCode: 'NL-2611-B',
      reasonDetail: 'between_lots',
      change: null,
    });
    expect((await entries({ lotId: first.id }))[0]).toMatchObject({
      toLotCode: 'NL-2611-B',
      quantityOut: '30.0000',
      quantityIn: null,
    });
    expect(await entries({ lotId: second.id })).toEqual([
      expect.objectContaining({
        quantityIn: '30.0000',
        quantityOut: null,
        balance: '30.0000',
      }),
    ]);

    // Any other movement names no second lot.
    const [receipt] = await entries({ reason: 'receipt' });
    expect(receipt).toMatchObject({ toLotId: null, toLotCode: null });

    // Each lot's cost history names the other.
    const historyOf = async (lotId: string) =>
      body<{ lotCost: { entries: Record<string, unknown>[] } }>(
        await w.org.agent.get(`/v1/costs/lots/${lotId}`).expect(200),
      ).lotCost.entries;
    expect((await historyOf(first.id))[0]).toMatchObject({
      kind: 'lot_change',
      reason: 'lot_change',
      quantity: '-30.0000',
      value: '-60.000000',
      otherLotId: second.id,
      otherLotCode: 'NL-2611-B',
    });
    expect(await historyOf(second.id)).toEqual([
      expect.objectContaining({
        kind: 'lot_change',
        quantity: '30.0000',
        value: '60.000000',
        otherLotId: first.id,
        otherLotCode: 'NL-2611-A',
      }),
    ]);
    expect((await historyOf(first.id))[1]).toMatchObject({
      kind: 'movement',
      otherLotId: null,
      otherLotCode: null,
    });

    // The export says which lot change it was, and both its lots: Lot the
    // one it left, To lot the one it entered, empty on any other row.
    const csv = await w.org.agent
      .get('/v1/stock/movements/export')
      .query({ variantId: w.code })
      .expect(200);
    expect(csv.text).toContain(',Moved to another lot,lot_change,');
    const [header, ...lines] = csv.text
      .replace(/^\uFEFF/, '')
      .trimEnd()
      .split('\r\n')
      .map((line) => line.split(','));
    const lot = header.indexOf('Lot');
    expect(header[lot + 1]).toBe('To lot');
    const byReason = (code: string) =>
      lines
        .filter((line) => line[header.indexOf('Reason code')] === code)
        .map((line) => line.slice(lot, lot + 2));
    expect(byReason('lot_change')).toEqual([['NL-2611-A', 'NL-2611-B']]);
    expect(byReason('receipt')).toEqual([['NL-2611-A', '']]);
  });

  it('refuses more than is there, the same lot, another item’s lot, another organization’s lot or place, no lot, no note, and anyone without stock.adjust, writing nothing (R20, #314)', async () => {
    const w = await world();
    const first = await buy(w, '20', '2.00', 'NL-2611-A');
    const other = await createVariant(w.org.agent, {
      type: 'good',
      name: 'Zinc',
      variant: { sku: 'ZINC-30', unitOfMeasure: 'each', tracksLots: true },
    });
    await receive(w.org.agent, other, w.main, '5', { code: 'ZN-1' });
    const zinc = await lotOf('ZN-1');

    const beta = await world('beta');
    await receive(beta.org.agent, beta.code, beta.main, '5', { code: 'B-1' });
    const theirs = await lotOf('B-1');

    const refused = async (
      payload: Record<string, unknown>,
      status: number,
      lotId = first.id,
      agent: Agent = w.org.agent,
    ) =>
      agent
        .post(path(lotId))
        .send({
          locationId: w.main,
          quantity: '5',
          note: 'Two runs in one delivery',
          ...payload,
        })
        .expect(status);

    // More than is there, and where the lot has none; a made code then
    // uses no number.
    const tooMuch = await refused(
      { quantity: '21', lot: { makeCode: true } },
      409,
    );
    expect(message(tooMuch)).toBe(
      said('en', 'stock.enoughStockLocationMovement'),
    );
    await refused({ locationId: w.annex, lot: { code: 'NL-X' } }, 409);

    const same = await refused({ toLotId: first.id }, 400);
    expect(message(same)).toBe(
      said('en', 'stock.lotChangeSameLot', { lot: 'NL-2611-A' }),
    );
    for (const toLotId of [zinc.id, theirs.id]) {
      const notIts = await refused({ toLotId }, 400);
      expect(message(notIts)).toBe(
        said('en', 'stock.lotChangeNotItsLot', { sku: 'VITC-90' }),
      );
    }
    const place = await refused(
      { locationId: beta.main, lot: { code: 'NL-X' } },
      400,
    );
    expect(message(place)).toBe(said('en', 'stock.unknownLocation'));

    // Another organization's lot, by the path, is not found, either way.
    await refused({ lot: { code: 'NL-X' } }, 404, theirs.id);
    await refused({ lot: { code: 'NL-X' } }, 404, first.id, beta.org.agent);

    const none = await refused({}, 400);
    expect(message(none)).toBe(said('en', 'stock.lotChangeNeedsLot'));
    const both = await refused(
      { toLotId: zinc.id, lot: { code: 'NL-X' } },
      400,
    );
    expect(message(both)).toBe(said('en', 'stock.giveEitherExistingLot'));
    const blank = await refused({ lot: { code: 'NL-X' }, note: '   ' }, 400);
    expect(message(blank)).toBe(said('en', 'stock.lotChangeNeedsNote'));
    await refused({ lot: { code: 'NL-X' }, note: undefined }, 400);

    // Moving stock between lots corrects the record: stock.adjust.
    await customRole(app, w.org.organizationId, 'Mover', [
      'stock.view',
      'stock.move',
      'locations.view',
    ]);
    const mover = await addMember(app, w.org, 'mover@example.com', 'Mover');
    await refused({ lot: { code: 'NL-X' } }, 403, first.id, mover);

    // Nothing was written.
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.reason, 'lot_change')),
    ).toEqual([]);
    expect(await lotOf('NL-X')).toBeUndefined();
    expect(await pileOf(first.id, w.main)).toBe('20.0000');

    const made = await move(w, first.id, {
      quantity: '5',
      lot: { makeCode: true },
    });
    expect(made.toLot.code).toMatch(/^L-\d{4}-\d{2}-\d{2}-1$/);
  });

  it('refuses a move out of a lot issued to a run still open, naming the run, until it is cancelled, and its pile says why (review 73)', async () => {
    const w = await world();
    const a = await buy(w, '100', '2.00', 'A');
    const output = await createVariant(w.org.agent, {
      type: 'good',
      name: 'Immune blend',
      variant: { sku: 'IMM-60', unitOfMeasure: 'each', tracksLots: true },
    });
    const bomId = body<{ bom: { id: string } }>(
      await w.org.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '100',
          lines: [{ componentVariantId: w.code, quantity: '30' }],
        })
        .expect(201),
    ).bom.id;
    await w.org.agent.post(`/v1/boms/${bomId}/promote`).expect(204);

    /** A run at the Annex, its 30 of lot A issued there from Main. */
    async function released(reference: string | null) {
      const runId = body<{ productionOrder: { id: string } }>(
        await w.org.agent
          .post('/v1/production-orders')
          .send({
            outputVariantId: output,
            bomId,
            locationId: w.annex,
            quantityPlanned: '100',
            ...(reference ? { reference } : {}),
          })
          .expect(201),
      ).productionOrder.id;
      await w.org.agent
        .post(`/v1/production-orders/${runId}/release`)
        .send({ sourceLocationId: w.main })
        .expect(200);
      return runId;
    }

    const runId = await released('B-2611');
    const refused = await w.org.agent
      .post(path(a.id))
      .send({
        locationId: w.annex,
        quantity: '5',
        lot: { code: 'B' },
        note: 'Two runs in one delivery',
      })
      .expect(409);
    expect(message(refused)).toBe(
      said('en', 'stock.lotChangeIssuedToRun', { code: 'A', run: 'B-2611' }),
    );
    expect(await lotOf('B')).toBeUndefined();
    expect(await pileOf(a.id, w.annex)).toBe('30.0000');

    // Its pile says why; the same lot at Main, never issued, does not.
    const { places } = body<{
      places: {
        locationId: string;
        lots: { lotId: string; issuedToRun: unknown }[];
      }[];
    }>(await w.org.agent.get(`/v1/stock/by-code/${w.code}/places`).expect(200));
    const issuedAt = (at: string) =>
      places.find((place) => place.locationId === at)!.lots[0].issuedToRun;
    expect(issuedAt(w.annex)).toEqual({
      id: runId,
      reference: 'B-2611',
      quantityPlanned: '100.0000',
    });
    expect(issuedAt(w.main)).toBeNull();
    await move(w, a.id, { quantity: '5', lot: { code: 'C' } });

    // A run with no reference is named by what it plans.
    await w.org.agent
      .post(`/v1/production-orders/${runId}/cancel`)
      .send({ reason: 'Planned twice' })
      .expect(200);
    await released(null);
    const unnamed = await w.org.agent
      .post(path(a.id))
      .send({
        locationId: w.annex,
        quantity: '5',
        toLotId: (await lotOf('C')).id,
        note: 'Two runs in one delivery',
      })
      .expect(409);
    expect(message(unnamed)).toBe(
      said('en', 'stock.lotChangeIssuedToUnnamedRun', {
        code: 'A',
        quantity: '100',
      }),
    );
  });
});
