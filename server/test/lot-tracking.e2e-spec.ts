import type { INestApplication } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  lots,
  orderLines,
  productVariants,
  stockLevels,
  stockMovements,
  stockValuations,
  valuationPools,
} from '../src/database/schema';
import { each, expectCostToFollow } from './utils/cost-follows';
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
import { order, output, receive, recipe, run } from './utils/reorder-world';
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

/** A code's figures as Where it stands sends them, the ones a start keeps. */
interface Standing {
  variantId: string;
  onHand: string;
  usable: string;
  notUsable: string;
  expired: string;
  held: string;
  free: string;
  stillNeeded: string;
  short: string;
  coming: string;
  position: string;
  expiresFirst: string | null;
  status: string | null;
}

interface Question {
  sku: string;
  onHand: string;
  places: { locationName: string; locationPath: string[]; quantity: string }[];
  runCount: number;
  runs: { id: string; reference: string | null; makes: boolean }[] | null;
}

interface Started {
  lot: { id: string; code: string } | null;
}

interface MovementRow {
  reason: string;
  reasonDetail: string | null;
  lotId: string | null;
  quantityIn: string | null;
  quantityOut: string | null;
  change: string | null;
  balance: string | null;
}

/**
 * Start tracking lots for a code that holds stock (ADR-094, R13 to R18):
 * one write, under products.update and stock.adjust, that puts the stock
 * on hand at every place into one lot made for us, its cost history with
 * it, every figure as before; never for equipment, never twice.
 */
describe('Start tracking lots (e2e)', () => {
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
   * An organization costing in CAD, two sites, a supplier and a customer,
   * and a code not tracked: BOTTLE-A60, a good.
   */
  async function world(slugish = 'alpha') {
    const org = await registerOrganization(app, slugish);
    await org.agent
      .patch('/v1/organization')
      .send({ baseCurrency: 'CAD' })
      .expect(204);
    const site = (name: string) =>
      createLocation(org.agent, { type: 'site', name, code: name });
    const code = await createVariant(org.agent, {
      type: 'good',
      name: 'Amber bottle',
      variant: { sku: 'BOTTLE-A60', unitOfMeasure: 'each' },
    });
    return {
      org,
      code,
      productId: await productOf(code),
      main: await site('Main'),
      annex: await site('Annex'),
      supplier: await createPartner(org.agent, { name: 'Glassworks' }),
      customer: await createPartner(org.agent, { name: 'Harbour Foods' }),
    };
  }

  type World = Awaited<ReturnType<typeof world>>;

  async function productOf(variantId: string): Promise<string> {
    const [row] = await db
      .select({ productId: productVariants.productId })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    return row.productId;
  }

  /** Bought at a price in CAD, received in full at one place. */
  async function buy(
    w: World,
    quantity: string,
    unitPrice: string,
    at: string,
    variantId = w.code,
  ) {
    await bought(
      { agent: w.org.agent, supplier: w.supplier, shelf: at },
      variantId,
      quantity,
      cad(unitPrice),
    );
  }

  const path = (w: World, variantId = w.code, productId = w.productId) =>
    `/v1/products/${productId}/variants/${variantId}/lot-tracking`;

  async function question(w: World, agent: Agent = w.org.agent) {
    return body<Question>(await agent.get(path(w)).expect(200));
  }

  async function start(w: World, payload: Record<string, unknown> = {}) {
    return body<Started>(
      await w.org.agent.post(path(w)).send(payload).expect(201),
    );
  }

  async function standing(w: World): Promise<Standing> {
    const { codes } = body<{ codes: (Standing & Record<string, unknown>)[] }>(
      await w.org.agent.get(`/v1/products/${w.productId}/stock`).expect(200),
    );
    const code = codes.find((each) => each.variantId === w.code)!;
    return {
      variantId: code.variantId,
      onHand: code.onHand,
      usable: code.usable,
      notUsable: code.notUsable,
      expired: code.expired,
      held: code.held,
      free: code.free,
      stillNeeded: code.stillNeeded,
      short: code.short,
      coming: code.coming,
      position: code.position,
      expiresFirst: code.expiresFirst,
      status: code.status,
    };
  }

  async function piles(variantId: string) {
    return db
      .select({
        locationId: stockLevels.locationId,
        lotId: stockLevels.lotId,
        quantity: stockLevels.quantity,
      })
      .from(stockLevels)
      .where(eq(stockLevels.variantId, variantId))
      .orderBy(stockLevels.locationId, stockLevels.lotId);
  }

  async function movements(w: World, query: Record<string, string>) {
    const res = await w.org.agent
      .get('/v1/stock/movements')
      .query({ variantId: w.code, ...query })
      .expect(200);
    return body<{ entries: MovementRow[] }>(res).entries;
  }

  /** Stock value's pools, and their totals, a read of their own (R6). */
  async function valuation(w: World) {
    const [page, totals] = await Promise.all([
      w.org.agent.get('/v1/costs/valuation').expect(200),
      w.org.agent.get('/v1/costs/valuation/totals').expect(200),
    ]);
    return {
      ...body<{ total: string; provisional: boolean }>(totals),
      ...body<{
        entries: { lotId: string | null; quantity: string; value: string }[];
      }>(page),
    };
  }

  async function waiting(w: World) {
    const res = await w.org.agent.get('/v1/costs/needs-cost').expect(200);
    return body<{ entries: { id: string; lotId: string | null }[] }>(res)
      .entries;
  }

  it('asks where the stock is, then puts all of it into one lot made for us, noted, every figure as before (R14, R15)', async () => {
    const w = await world();
    await buy(w, '3000', '0.40', w.main);
    await buy(w, '1200', '0.40', w.annex);
    // Held 500 for a sale, 1000 coming on a purchase.
    await order(w.org.agent, 'sale', w.customer, w.code, '500');
    await order(w.org.agent, 'purchase', w.supplier, w.code, '1000');

    expect(await question(w)).toEqual({
      variantId: w.code,
      sku: 'BOTTLE-A60',
      onHand: '4200.0000',
      places: [
        expect.objectContaining({
          locationName: 'Annex',
          quantity: '1200.0000',
        }),
        expect.objectContaining({
          locationName: 'Main',
          quantity: '3000.0000',
        }),
      ],
      runCount: 0,
      runs: [],
    });

    const before = await standing(w);
    const { lot } = await start(w, {
      supplierLot: 'gw-2611/a',
      expiry: 'unknown',
    });

    expect(lot?.code).toMatch(/^L-\d{4}-\d{2}-\d{2}-1$/);
    expect(await standing(w)).toEqual(before);
    expect(before).toMatchObject({
      onHand: '4200.0000',
      held: '500.0000',
      free: '3700.0000',
      coming: '1000.0000',
    });

    const [made] = await db.select().from(lots).where(eq(lots.id, lot!.id));
    expect(made).toMatchObject({
      variantId: w.code,
      isAssigned: true,
      note: 'tracking_started',
      supplierLot: 'gw-2611/a',
      expiry: 'unknown',
      expiresAt: null,
    });

    const [code] = await db
      .select({ tracksLots: productVariants.tracksLots })
      .from(productVariants)
      .where(eq(productVariants.id, w.code));
    expect(code.tracksLots).toBe(true);

    // Each place's quantity, now in the lot; the piles with no lot empty.
    expect(await piles(w.code)).toEqual(
      expect.arrayContaining([
        { locationId: w.main, lotId: lot!.id, quantity: '3000.0000' },
        { locationId: w.annex, lotId: lot!.id, quantity: '1200.0000' },
        { locationId: w.main, lotId: null, quantity: '0.0000' },
        { locationId: w.annex, lotId: null, quantity: '0.0000' },
      ]),
    );

    // One lot change a place, none into the lot, Lots started (R16).
    const changes = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reason, 'lot_change'));
    expect(
      changes.map((each) => ({
        at: each.fromLocationId,
        to: each.toLocationId,
        lotId: each.lotId,
        toLotId: each.toLotId,
        quantity: each.quantity,
        detail: each.reasonDetail,
      })),
    ).toEqual(
      expect.arrayContaining([
        {
          at: w.main,
          to: w.main,
          lotId: null,
          toLotId: lot!.id,
          quantity: '3000.0000',
          detail: 'lots_started',
        },
        {
          at: w.annex,
          to: w.annex,
          lotId: null,
          toLotId: lot!.id,
          quantity: '1200.0000',
          detail: 'lots_started',
        },
      ]),
    );
    expect(changes).toHaveLength(2);

    // Who and when, in the item's History (R16).
    const history = await w.org.agent
      .get('/v1/audit')
      .query({ resourceId: w.productId })
      .expect(200);
    expect(JSON.stringify(history.body)).toContain(
      'product.lot_tracking_started',
    );
  });

  // Stock nobody checked is not said to last for ever (S6): with no
  // expiry given, the lot's is not known yet, listed under Details to
  // add, and still usable, never expired (R15, R9).
  it('stores the expiry as not known yet where the question gives none, every figure as before (S6, R15)', async () => {
    const w = await world();
    await buy(w, '300', '0.40', w.main);

    const before = await standing(w);
    const { lot } = await start(w);

    const [made] = await db.select().from(lots).where(eq(lots.id, lot!.id));
    expect(made).toMatchObject({ expiry: 'unknown', expiresAt: null });
    expect(await standing(w)).toEqual(before);
    expect(before).toMatchObject({
      onHand: '300.0000',
      usable: '300.0000',
      expiresFirst: null,
    });

    // A day given, without its kind, as a tab may send it: that day.
    const dated = await world('beta');
    await buy(dated, '5', '0.40', dated.main);
    const { lot: datedLot } = await start(dated, { expiresAt: '2099-01-31' });
    const [madeDated] = await db
      .select()
      .from(lots)
      .where(eq(lots.id, datedLot!.id));
    expect(madeDated).toMatchObject({
      expiry: 'date',
      expiresAt: '2099-01-31',
    });
  });

  it('starts for stock at a retired place too, which it never leaves, while a receipt there is still refused (review 74)', async () => {
    const w = await world();
    await buy(w, '300', '0.40', w.main);
    await buy(w, '20', '0.40', w.annex);
    await w.org.agent
      .patch(`/v1/locations/${w.annex}`)
      .send({ isActive: false })
      .expect(204);

    const { lot } = await start(w);

    expect(
      (await piles(w.code)).filter(
        (pile) => pile.locationId === w.annex && pile.lotId,
      ),
    ).toEqual([{ locationId: w.annex, lotId: lot!.id, quantity: '20.0000' }]);
    await w.org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: w.code,
        lotId: lot!.id,
        toLocationId: w.annex,
        quantity: '1',
        reason: 'adjustment',
        reasonDetail: 'found',
        note: 'A box found behind the cartons at the count',
      })
      .expect(409);
  });

  it('moves the code’s whole cost history into the lot: Stock value unchanged, what waited still waits, its cost landing on the lot (R17)', async () => {
    const w = await world();
    await buy(w, '100', '2.00', w.main);
    // Received by hand, with no price: it waits for a cost.
    await receive(w.org.agent, w.code, w.annex, '50');
    const [receipt] = await waiting(w);

    const before = await valuation(w);
    const { lot } = await start(w);

    const after = await valuation(w);
    expect(after.total).toBe(before.total);
    expect(after.provisional).toBe(true);
    expect(after.entries).toEqual([
      expect.objectContaining({
        lotId: lot!.id,
        quantity: '150.0000',
        value: before.entries[0].value,
      }),
    ]);

    // Still waiting, the same row, now the lot's.
    expect(await waiting(w)).toEqual([
      expect.objectContaining({ id: receipt.id, lotId: lot!.id }),
    ]);
    const noLot = await db
      .select()
      .from(stockValuations)
      .where(
        and(
          eq(stockValuations.variantId, w.code),
          isNull(stockValuations.lotId),
        ),
      );
    expect(noLot).toEqual([]);

    // Costed afterwards, it values the lot: 100 × 2.00 + 50 × 3.00.
    await w.org.agent
      .put(`/v1/costs/valuations/${receipt.id}`)
      .send({ unitPrice: '3.00', currency: 'CAD' })
      .expect(200);
    const [pool] = await db
      .select()
      .from(valuationPools)
      .where(eq(valuationPools.variantId, w.code));
    expect(pool).toMatchObject({
      lotId: lot!.id,
      quantity: '150.0000',
      value: '350.000000',
    });
    expect(await waiting(w)).toEqual([]);
  });

  it('puts a batch’s cost on the lot, its run closing after its product started (Q2a)', async () => {
    const w = await world();
    const blend = await createVariant(w.org.agent, {
      type: 'material',
      name: 'Blend',
      variant: { sku: 'BLEND', unitOfMeasure: 'each' },
    });
    await buy(w, '10', '5.00', w.main, blend);
    const bomId = await recipe(w.org.agent, w.code, blend, '0.1');
    const runId = await run(
      w.org.agent,
      {
        outputId: w.code,
        bomId,
        locationId: w.annex,
        quantityPlanned: '100',
        reference: 'B-2611',
      },
      w.main,
    );
    // The batch made before its product tracks lots: no lot of its own.
    await output(w.org.agent, runId, '100');

    expect(await question(w)).toMatchObject({
      onHand: '100.0000',
      runCount: 1,
      runs: [{ id: runId, reference: 'B-2611', makes: true }],
    });
    const { lot } = await start(w);

    await w.org.agent
      .post(`/v1/production-orders/${runId}/close`)
      .send({})
      .expect(200);

    // 10 of the blend at 5.00 made the 100: 50.00, on the lot.
    const cost = body<{
      runCost: {
        materialCost: string;
        provisional: boolean;
        outputs: { lotCode: string | null; quantity: string; value: string }[];
      };
    }>(await w.org.agent.get(`/v1/costs/runs/${runId}`).expect(200)).runCost;
    expect(cost).toMatchObject({
      materialCost: '50.000000',
      provisional: false,
      outputs: [
        { lotCode: lot!.code, quantity: '100.0000', value: '50.000000' },
      ],
    });
    const pools = await db
      .select()
      .from(valuationPools)
      .where(eq(valuationPools.variantId, w.code));
    expect(pools).toEqual([
      expect.objectContaining({
        lotId: lot!.id,
        quantity: '100.0000',
        value: '50.000000',
      }),
    ]);
    expect(await waiting(w)).toEqual([]);
  });

  it('keeps a run provisional that drew on stock still waiting, once its component started (Q2a)', async () => {
    const w = await world();
    const focus = await createVariant(w.org.agent, {
      type: 'good',
      name: 'Focus',
      variant: { sku: 'FOCUS', unitOfMeasure: 'each' },
    });
    // The bottles waiting for a cost, used by a run, the rest kept.
    await receive(w.org.agent, w.code, w.main, '20');
    const bomId = await recipe(w.org.agent, focus, w.code, '1');
    const runId = await run(
      w.org.agent,
      { outputId: focus, bomId, locationId: w.annex, quantityPlanned: '10' },
      w.main,
    );
    await output(w.org.agent, runId, '10');
    await w.org.agent
      .post(`/v1/production-orders/${runId}/close`)
      .send({})
      .expect(200);
    const provisional = async () =>
      body<{ runCost: { provisional: boolean } }>(
        await w.org.agent.get(`/v1/costs/runs/${runId}`).expect(200),
      ).runCost.provisional;
    expect(await provisional()).toBe(true);

    await start(w);

    expect(await provisional()).toBe(true);
  });

  it('keeps the stock card’s balance, a lot change in neither In nor Out, and counts it In for the lot (R16)', async () => {
    const w = await world();
    await buy(w, '3000', '0.40', w.main);
    await buy(w, '1200', '0.40', w.annex);
    await w.org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: w.code,
        fromLocationId: w.main,
        quantity: '200',
        reason: 'shipment',
      })
      .expect(201);

    const [before] = await movements(w, { locationId: w.main });
    expect(before.balance).toBe('2800.0000');

    const { lot } = await start(w, {
      expiry: 'date',
      expiresAt: '2031-06-30',
    });

    // At one place: the lot change counts 0, the balance holds.
    const [change, last] = await movements(w, { locationId: w.main });
    expect(change).toMatchObject({
      reason: 'lot_change',
      reasonDetail: 'lots_started',
      quantityIn: null,
      quantityOut: null,
      change: null,
      balance: '2800.0000',
    });
    expect(last.balance).toBe('2800.0000');

    // Every place: the same, at 4000.
    const [across] = await movements(w, {});
    expect(across).toMatchObject({ change: null, balance: '4000.0000' });

    // The lot chosen: In, from nothing to what it holds, the newer row
    // at 4000 and the one before it at what it brought.
    const inLot = await movements(w, { lotId: lot!.id });
    expect(inLot.map((row) => row.quantityIn).sort()).toEqual([
      '1200.0000',
      '2800.0000',
    ]);
    expect(inLot[0].balance).toBe('4000.0000');
    expect(inLot[1].balance).toBe(inLot[1].quantityIn);
    const atMainInLot = await movements(w, {
      lotId: lot!.id,
      locationId: w.main,
    });
    expect(atMainInLot).toEqual([
      expect.objectContaining({
        quantityIn: '2800.0000',
        balance: '2800.0000',
      }),
    ]);

    // Its reason in the filter and in the export.
    expect(await movements(w, { reason: 'lot_change' })).toHaveLength(2);
    const csv = await w.org.agent
      .get('/v1/stock/movements/export')
      .query({ variantId: w.code })
      .expect(200);
    expect(csv.text).toContain(',Lot tracking started,lot_change,');
  });

  it('turns tracking on alone for a code with nothing on hand: no lot, no movement, and a receipt then asks for one (R13)', async () => {
    const w = await world();

    expect(await question(w)).toMatchObject({
      onHand: '0.0000',
      places: [],
    });
    expect(await start(w)).toEqual({ lot: null });

    expect(await db.select().from(lots)).toEqual([]);
    expect(
      await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.variantId, w.code)),
    ).toEqual([]);

    const refused = await w.org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: w.code,
        toLocationId: w.main,
        quantity: '5',
        reason: 'receipt',
      })
      .expect(400);
    expect(message(refused)).toBe(
      said('en', 'stock.lotTrackingStarted', { sku: 'BOTTLE-A60' }),
    );
  });

  it('refuses equipment, a code that tracks lots, another organization’s code, and anyone without both permissions, writing nothing (R13, R18)', async () => {
    const w = await world();
    await buy(w, '10', '1.00', w.main);

    const drill = await createVariant(w.org.agent, {
      type: 'equipment',
      name: 'Drill',
      variant: { sku: 'DRILL-1', unitOfMeasure: 'each' },
    });
    const equipment = await w.org.agent
      .post(path(w, drill, await productOf(drill)))
      .send({})
      .expect(409);
    expect(message(equipment)).toBe(
      said('en', 'stock.lotTrackingNotForEquipment', { sku: 'DRILL-1' }),
    );

    // Without stock.adjust, or without products.update.
    const noAdjust = await memberWith(w.org, 'Catalogue', [
      'products.view',
      'products.update',
      'stock.view',
      'stock.move',
      'locations.view',
    ]);
    await noAdjust.get(path(w)).expect(403);
    await noAdjust.post(path(w)).send({}).expect(403);
    const noUpdate = await memberWith(w.org, 'Counter', [
      'products.view',
      'stock.view',
      'stock.move',
      'stock.adjust',
      'locations.view',
    ]);
    await noUpdate.post(path(w)).send({}).expect(403);

    // Another organization's code is not found.
    const beta = await registerOrganization(app, 'beta');
    await beta.agent.post(path(w)).send({}).expect(404);

    expect(await db.select().from(lots)).toEqual([]);

    await start(w);
    const again = await w.org.agent.post(path(w)).send({}).expect(409);
    expect(message(again)).toBe(
      said('en', 'stock.lotTrackingAlready', { sku: 'BOTTLE-A60' }),
    );
    await w.org.agent.get(path(w)).expect(409);
    expect(await db.select().from(lots)).toHaveLength(1);

    // Nothing in an update turns it off (R18).
    await w.org.agent
      .patch(`/v1/products/${w.productId}/variants/${w.code}`)
      .send({ tracksLots: false })
      .expect(400);
  });

  it('lists a run only for a reader who may see runs, its count for all (ADR-080)', async () => {
    const w = await world();
    const blend = await createVariant(w.org.agent, {
      type: 'material',
      name: 'Blend',
      variant: { sku: 'BLEND', unitOfMeasure: 'each' },
    });
    await buy(w, '10', '5.00', w.main, blend);
    const bomId = await recipe(w.org.agent, blend, w.code, '2');
    await buy(w, '40', '0.40', w.main);
    // A draft is not in progress: nothing is issued, and its release reads
    // the code as it then is.
    await run(w.org.agent, {
      outputId: blend,
      bomId,
      locationId: w.annex,
      quantityPlanned: '5',
    });
    await run(
      w.org.agent,
      { outputId: blend, bomId, locationId: w.annex, quantityPlanned: '5' },
      w.main,
    );
    const blind = await memberWith(w.org, 'Stockroom', [
      'products.view',
      'products.update',
      'stock.view',
      'stock.move',
      'stock.adjust',
      'locations.view',
    ]);
    expect(await question(w, blind)).toMatchObject({ runCount: 1, runs: null });
    expect(await question(w)).toMatchObject({
      runCount: 1,
      runs: [expect.objectContaining({ makes: false })],
    });
  });

  it('waits for a receipt begun before it, and puts that stock in the lot too (two at once)', async () => {
    const w = await world();
    await buy(w, '100', '1.00', w.main);

    // Hold the shelf's pile, so the receipt stops half way, the code read.
    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let held!: () => void;
    const holding = new Promise<void>((resolve) => (held = resolve));
    const holder = db.transaction(async (tx) => {
      await tx.execute(sql`
        select 1 from stock_levels
        where variant_id = ${w.code}::uuid and lot_id is null
        for update
      `);
      held();
      await released;
    });
    await holding;

    const receipt = w.org.agent
      .post('/v1/stock/movements')
      .send({
        variantId: w.code,
        toLocationId: w.main,
        quantity: '10',
        reason: 'receipt',
      })
      .then((res) => res);
    await waitersReach(1);
    const started = w.org.agent
      .post(path(w))
      .send({})
      .then((res) => res);
    await waitersReach(2);
    release();
    await holder;

    const [received, start] = await Promise.all([receipt, started]);
    expect(received.status).toBe(201);
    expect(start.status).toBe(201);
    const { lot } = body<Started>(start);

    expect(await piles(w.code)).toEqual([
      { locationId: w.main, lotId: lot!.id, quantity: '110.0000' },
      { locationId: w.main, lotId: null, quantity: '0.0000' },
    ]);
  });

  /**
   * Stock that left before the code's lot tracking started and comes back
   * after (ADR-094, R19): a return and an RMA's receipt, a voided shipment,
   * a run released before, each at the cost it left at (Q2a, Q3a); a code
   * started with nothing on hand gets its start lot then (Q4a).
   */
  describe('what comes back from before (R19)', () => {
    /** Shipped on the sale from one place; the shipment's id. */
    async function shipOut(
      w: World,
      sale: { id: string; lineId: string },
      at: string,
      quantity: string,
    ) {
      return body<{ shipment: { id: string } }>(
        await w.org.agent
          .post(`/v1/orders/${sale.id}/shipments`)
          .send({
            fromLocationId: at,
            lines: [{ lineId: sale.lineId, quantity }],
          })
          .expect(201),
      ).shipment.id;
    }

    interface Returnable {
      tracksLots: boolean;
      quantityReturned: string;
      lots: { lotId: string; shipped: string; returned: string }[];
      fromBefore: {
        shipped: string;
        returned: string;
        lotId: string | null;
        lotCode: string | null;
      } | null;
    }

    async function returnable(w: World, orderId: string) {
      return body<Returnable[]>(
        await w.org.agent
          .get(`/v1/orders/${orderId}/returns/returnable`)
          .expect(200),
      );
    }

    function giveBack(
      w: World,
      orderId: string,
      payload: Record<string, unknown>,
    ) {
      return w.org.agent.post(`/v1/orders/${orderId}/returns`).send(payload);
    }

    /** The code's movements of one reason, oldest first. */
    async function moved(w: World, reason: string) {
      return db
        .select({
          at: stockMovements.toLocationId,
          lotId: stockMovements.lotId,
          toLotId: stockMovements.toLotId,
          quantity: stockMovements.quantity,
          detail: stockMovements.reasonDetail,
          referenceType: stockMovements.referenceType,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.variantId, w.code),
            eq(stockMovements.reason, reason as 'return'),
          ),
        )
        .orderBy(stockMovements.createdAt, stockMovements.id);
    }

    /** A lot change's two value rows, out then in. */
    async function lotChangeValues(w: World) {
      return db
        .select({
          lotId: stockValuations.lotId,
          quantity: stockValuations.quantity,
          value: stockValuations.value,
          needsCost: stockValuations.needsCost,
        })
        .from(stockValuations)
        .where(
          and(
            eq(stockValuations.variantId, w.code),
            eq(stockValuations.kind, 'lot_change'),
          ),
        )
        .orderBy(stockValuations.id);
    }

    it('takes back a sale shipped before the start by quantity, with no lot as it left, then into the start lot, at the cost it left at (Q3a)', async () => {
      const w = await world();
      await buy(w, '100', '2.00', w.main);
      const sale = await order(w.org.agent, 'sale', w.customer, w.code, '40');
      // 30 leave at 2.00, with no lot; then 140 at 3.00 each.
      await shipOut(w, sale, w.main, '30');
      await buy(w, '70', '4.00', w.main);
      const { lot } = await start(w);
      // 5 of the lot at 3.00.
      await shipOut(w, sale, w.main, '5');

      const [line] = await returnable(w, sale.id);
      expect(line).toMatchObject({
        tracksLots: true,
        lots: [{ lotId: lot!.id, shipped: '5.0000', returned: '0' }],
        fromBefore: {
          shipped: '30.0000',
          returned: '0',
          lotId: lot!.id,
          lotCode: lot!.code,
        },
      });

      // 10 from before and 2 of the lot, at the annex.
      await giveBack(w, sale.id, {
        toLocationId: w.annex,
        lines: [
          {
            lineId: sale.lineId,
            quantity: '10',
            lots: [{ lotId: lot!.id, quantity: '2' }],
          },
        ],
      }).expect(201);

      expect(await moved(w, 'return')).toEqual([
        expect.objectContaining({
          at: w.annex,
          lotId: null,
          quantity: '10.0000',
          referenceType: 'order_return',
        }),
        expect.objectContaining({
          at: w.annex,
          lotId: lot!.id,
          quantity: '2.0000',
        }),
      ]);
      expect(
        (await moved(w, 'lot_change')).filter(
          (each) => each.detail === 'from_before',
        ),
      ).toEqual([
        {
          at: w.annex,
          lotId: null,
          toLotId: lot!.id,
          quantity: '10.0000',
          detail: 'from_before',
          referenceType: null,
        },
      ]);
      // The export reads it as its action, as Movements does (U1).
      const csv = await w.org.agent
        .get('/v1/stock/movements/export')
        .query({ variantId: w.code })
        .expect(200);
      expect(csv.text).toContain(',Back from before lot tracking,lot_change,');

      // Its value follows by the lot change's rows: 10 at 2.00, as it left.
      expect(await lotChangeValues(w)).toEqual([
        {
          lotId: null,
          quantity: '-10.0000',
          value: '-20.000000',
          needsCost: false,
        },
        {
          lotId: lot!.id,
          quantity: '10.0000',
          value: '20.000000',
          needsCost: false,
        },
      ]);
      // 140 at 420.00, less 5 at 3.00, the 2 back at 3.00, the 10 at 2.00.
      expect(await poolOf(db, w.code, lot!.id)).toMatchObject({
        quantity: '147.0000',
        value: '431.000000',
      });
      expect(await piles(w.code)).toEqual(
        expect.arrayContaining([
          { locationId: w.annex, lotId: lot!.id, quantity: '12.0000' },
          { locationId: w.annex, lotId: null, quantity: '0.0000' },
        ]),
      );
      expect(await waiting(w)).toEqual([]);

      const [after] = await returnable(w, sale.id);
      expect(after).toMatchObject({
        quantityReturned: '12.0000',
        lots: [{ lotId: lot!.id, returned: '2.0000' }],
        fromBefore: { shipped: '30.0000', returned: '10.0000' },
      });

      // Never more than shipped before, and nothing written.
      const before = await moved(w, 'return');
      const over = await giveBack(w, sale.id, {
        toLocationId: w.annex,
        lines: [{ lineId: sale.lineId, quantity: '21' }],
      }).expect(409);
      expect(message(over)).toBe(
        said('en', 'orders.moreSkuFromBefore', {
          sku: 'BOTTLE-A60',
          shipped: '30.0000',
          returned: '10.0000',
        }),
      );
      expect(await moved(w, 'return')).toEqual(before);

      // A sale shipped after the start alone takes no quantity.
      const later = await order(w.org.agent, 'sale', w.customer, w.code, '3');
      await shipOut(w, later, w.main, '3');
      expect((await returnable(w, later.id))[0].fromBefore).toBeNull();
      const byQuantity = await giveBack(w, later.id, {
        toLocationId: w.annex,
        lines: [{ lineId: later.lineId, quantity: '1' }],
      }).expect(400);
      expect(message(byQuantity)).toBe(
        said('en', 'orders.skuTrackedLotSend', { sku: 'BOTTLE-A60' }),
      );
    });

    it('receives an RMA’s goods shipped before the start the same way, held to what it authorized (Q3a)', async () => {
      const w = await world();
      await buy(w, '50', '2.00', w.main);
      const sale = await order(w.org.agent, 'sale', w.customer, w.code, '20');
      await shipOut(w, sale, w.main, '20');
      // 30 at 2.00 and 50 at 6.00: 80 at 360.00.
      await buy(w, '50', '6.00', w.main);
      const { lot } = await start(w);

      const rma = body<{ returnAuthorization: { id: string } }>(
        await w.org.agent
          .post('/v1/return-authorizations')
          .send({
            orderId: sale.id,
            reason: 'Two cases arrived cracked',
            lines: [
              { lineId: sale.lineId, quantity: '4', resolution: 'credit' },
            ],
          })
          .expect(201),
      ).returnAuthorization;

      const against = (quantity: string) =>
        giveBack(w, sale.id, {
          toLocationId: w.main,
          returnAuthorizationId: rma.id,
          lines: [{ lineId: sale.lineId, quantity }],
        });
      await against('4').expect(201);
      await against('1').expect(409);

      const { returnAuthorization } = body<{
        returnAuthorization: { lines: { quantityReceived: string }[] };
      }>(
        await w.org.agent
          .get(`/v1/return-authorizations/${rma.id}`)
          .expect(200),
      );
      expect(returnAuthorization.lines[0].quantityReceived).toBe('4.0000');

      // Back into the lot at 2.00, as it left.
      expect(await poolOf(db, w.code, lot!.id)).toMatchObject({
        quantity: '84.0000',
        value: '368.000000',
      });
      expect(await piles(w.code)).toEqual(
        expect.arrayContaining([
          { locationId: w.main, lotId: lot!.id, quantity: '84.0000' },
        ]),
      );
    });

    it('voids a shipment made before the start: its goods back with no lot, as they left, then into the start lot, at the cost they left at (Q3a, #647)', async () => {
      const w = await world();
      await buy(w, '100', '2.00', w.main);
      const sale = await order(w.org.agent, 'sale', w.customer, w.code, '20');
      const shipmentId = await shipOut(w, sale, w.main, '20');
      // 80 at 2.00 and 80 at 4.00: 160 at 480.00.
      await buy(w, '80', '4.00', w.main);
      const { lot } = await start(w);

      await w.org.agent
        .post(`/v1/orders/${sale.id}/shipments/${shipmentId}/void`)
        .send({ reason: 'Recorded too early' })
        .expect(204);

      expect(await moved(w, 'adjustment')).toEqual([
        {
          at: w.main,
          lotId: null,
          toLotId: null,
          quantity: '20.0000',
          detail: 'shipment_voided',
          referenceType: 'shipment',
        },
      ]);
      expect(
        (await moved(w, 'lot_change')).filter(
          (each) => each.detail === 'from_before',
        ),
      ).toEqual([
        expect.objectContaining({
          at: w.main,
          lotId: null,
          toLotId: lot!.id,
          quantity: '20.0000',
        }),
      ]);
      expect(await poolOf(db, w.code, lot!.id)).toMatchObject({
        quantity: '180.0000',
        value: '520.000000',
      });
      expect(await piles(w.code)).toEqual(
        expect.arrayContaining([
          { locationId: w.main, lotId: lot!.id, quantity: '180.0000' },
          { locationId: w.main, lotId: null, quantity: '0.0000' },
        ]),
      );
      const [line] = await db
        .select({ fulfilled: orderLines.quantityFulfilled })
        .from(orderLines)
        .where(eq(orderLines.id, sale.lineId));
      expect(line.fulfilled).toBe('0.0000');

      // Its detail is a key, read so on Movements (#647).
      expect(
        (await movements(w, { reason: 'adjustment' })).map(
          (row) => row.reasonDetail,
        ),
      ).toEqual(['shipment_voided']);
    });

    it('closes a run released before its component started against the start lot at its place, at the lot’s cost, no other lot there taken (Q2a)', async () => {
      const w = await world();
      const focus = await createVariant(w.org.agent, {
        type: 'good',
        name: 'Focus',
        variant: { sku: 'FOCUS', unitOfMeasure: 'each' },
      });
      await buy(w, '30', '2.00', w.main);
      const bomId = await recipe(w.org.agent, focus, w.code, '1');
      // 10 bottles issued to the annex with no lot.
      const runId = await run(
        w.org.agent,
        { outputId: focus, bomId, locationId: w.annex, quantityPlanned: '10' },
        w.main,
      );
      const { lot } = await start(w);
      // Another lot at the annex, never given to the run.
      await bought(
        { agent: w.org.agent, supplier: w.supplier, shelf: w.annex },
        w.code,
        '5',
        cad('9.00'),
        { code: 'OTHER-1' },
      );
      await output(w.org.agent, runId, '10');

      await w.org.agent
        .post(`/v1/production-orders/${runId}/close`)
        .send({})
        .expect(200);

      const consumed = await db
        .select({
          lotId: stockMovements.lotId,
          quantity: stockMovements.quantity,
        })
        .from(stockMovements)
        .where(
          and(
            eq(stockMovements.variantId, w.code),
            eq(stockMovements.reason, 'consumption'),
          ),
        );
      expect(consumed).toEqual([{ lotId: lot!.id, quantity: '10.0000' }]);
      const other = await db
        .select({ id: lots.id })
        .from(lots)
        .where(eq(lots.code, 'OTHER-1'));
      expect(await piles(w.code)).toEqual(
        expect.arrayContaining([
          { locationId: w.annex, lotId: other[0].id, quantity: '5.0000' },
          { locationId: w.annex, lotId: lot!.id, quantity: '0.0000' },
        ]),
      );

      // 10 of the lot at 2.00 made the 10.
      const cost = body<{
        runCost: { materialCost: string; provisional: boolean };
      }>(await w.org.agent.get(`/v1/costs/runs/${runId}`).expect(200)).runCost;
      expect(cost).toMatchObject({
        materialCost: '20.000000',
        provisional: false,
      });
    });

    it('makes the start lot with the first stock back where the code started with nothing on hand, and puts the rest back in it, at the cost it left at (Q4a)', async () => {
      const w = await world();
      await buy(w, '10', '2.00', w.main);
      const sale = await order(w.org.agent, 'sale', w.customer, w.code, '10');
      await shipOut(w, sale, w.main, '10');
      expect(await start(w)).toEqual({ lot: null });

      expect((await returnable(w, sale.id))[0].fromBefore).toEqual({
        shipped: '10.0000',
        returned: '0',
        lotId: null,
        lotCode: null,
      });

      const back = (quantity: string) =>
        giveBack(w, sale.id, {
          toLocationId: w.main,
          lines: [{ lineId: sale.lineId, quantity }],
        }).expect(201);
      await back('4');

      const made = await db
        .select()
        .from(lots)
        .where(eq(lots.variantId, w.code));
      expect(made).toHaveLength(1);
      expect(made[0].code).toMatch(/^L-\d{4}-\d{2}-\d{2}-1$/);
      expect(made).toEqual([
        expect.objectContaining({
          isAssigned: true,
          note: 'tracking_started',
          supplierLot: null,
          // Not known yet, as a start's is with nothing said (S6).
          expiry: 'unknown',
          expiresAt: null,
        }),
      ]);
      expect((await returnable(w, sale.id))[0].fromBefore).toEqual({
        shipped: '10.0000',
        returned: '4.0000',
        lotId: made[0].id,
        lotCode: made[0].code,
      });

      await back('2');
      expect(
        await db.select().from(lots).where(eq(lots.variantId, w.code)),
      ).toHaveLength(1);
      expect(await poolOf(db, w.code, made[0].id)).toMatchObject({
        quantity: '6.0000',
        value: '12.000000',
      });
      expect(await piles(w.code)).toEqual([
        { locationId: w.main, lotId: made[0].id, quantity: '6.0000' },
        { locationId: w.main, lotId: null, quantity: '0.0000' },
      ]);
    });

    it('carries a cost given later to stock back from before into its lot, which takes none by hand (Q3a, D5)', async () => {
      const w = await world();
      // Received with no price, then all of it sold at nothing.
      await receive(w.org.agent, w.code, w.main, '10');
      const [receipt] = await waiting(w);
      const sale = await order(w.org.agent, 'sale', w.customer, w.code, '10');
      await shipOut(w, sale, w.main, '10');
      await start(w);

      await giveBack(w, sale.id, {
        toLocationId: w.main,
        lines: [{ lineId: sale.lineId, quantity: '4' }],
      }).expect(201);
      const [made] = await db
        .select()
        .from(lots)
        .where(eq(lots.variantId, w.code));

      // The stock back waits with what it came from.
      const listed = await waiting(w);
      expect(listed).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ id: receipt.id, lotId: null }),
          expect.objectContaining({ lotId: made.id }),
        ]),
      );
      expect(listed).toHaveLength(2);
      const backIn = listed.find((entry) => entry.lotId === made.id)!;

      const refused = await w.org.agent
        .put(`/v1/costs/valuations/${backIn.id}`)
        .send({ unitPrice: '1.00', currency: 'CAD' })
        .expect(409);
      expect(message(refused)).toBe(said('en', 'stock.stockBackFromBefore'));

      // The delivery costed: 4 of its 10 came back into the lot.
      const { cost } = body<{
        cost: {
          held: string;
          issued: string;
          followed: { lotId: string; lotCode: string; value: string }[];
        };
      }>(
        await w.org.agent
          .put(`/v1/costs/valuations/${receipt.id}`)
          .send({ unitPrice: '1.00', currency: 'CAD' })
          .expect(200),
      );
      expect(cost).toMatchObject({
        held: '0.000000',
        issued: '6.000000',
        followed: [{ lotId: made.id, lotCode: made.code, value: '4.000000' }],
      });
      expect(await poolOf(db, w.code, made.id)).toMatchObject({
        quantity: '4.0000',
        value: '4.000000',
      });
      expect(await waiting(w)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: w.code,
        change: '10.000000',
        most: each('1.00'),
        answer: cost,
      });
    });
  });

  function message(res: Parameters<typeof body>[0]): string {
    return body<{ message: string }>(res).message;
  }

  /** A member of the organization holding exactly these permissions. */
  async function memberWith(org: Org, name: string, keys: string[]) {
    await customRole(app, org.organizationId, name, keys);
    return addMember(app, org, `${name.toLowerCase()}@example.com`, name);
  }

  /** Until this many of the test database's sessions wait on a lock. */
  async function waitersReach(count: number) {
    for (let tries = 0; tries < 200; tries++) {
      const { rows } = await db.execute<{ waiting: number }>(sql`
        select count(*)::int as waiting
        from pg_stat_activity
        where datname = current_database() and wait_event_type = 'Lock'
      `);
      if (rows[0].waiting >= count) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Fewer than ${count} sessions wait on a lock`);
  }
});
