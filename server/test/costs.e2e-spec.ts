import type { INestApplication } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { SUPPORTED_LOCALES } from '../src/common/locales';
import { todayIn } from '../src/common/today';
import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  exchangeRates,
  stockMovements,
  stockValuations,
} from '../src/database/schema';
import { each, expectCostToFollow } from './utils/cost-follows';
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
import { said } from './utils/said';
import { clearOfMidnight, KIRITIMATI, PAGO_PAGO } from './utils/time-zones';
import {
  buy,
  cad,
  expectBooksToReconcile,
  lotIdOf,
  move,
  poolOf,
  type Price,
  usd,
  valuationOf,
} from './utils/valuation';

interface RunCost {
  materialCost: string | null;
  unitCost: string | null;
  quantityProduced: string;
  closed: boolean;
  provisional: boolean;
  consumed: {
    sku: string;
    lotCode: string | null;
    quantity: string;
    value: string;
  }[];
  outputs: { lotCode: string | null; quantity: string; value: string }[];
}

interface CorrectedCost {
  value: string;
  held: string;
  issued: string;
  followed: { lotId: string; lotCode: string; value: string }[];
}

/**
 * Value that arrives after the stock (ADR-048): a batch's cost at close, a
 * cost set or corrected later, and the reads that show it. Money compared as
 * strings, as quantities are (ADR-025).
 */
describe('Costs (e2e)', () => {
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

  /**
   * The reconciliation from the valuation spec, with `issued` rows left out:
   * they belong to stock already gone and never enter a pool's balance.
   */
  afterEach(async () => {
    await expectBooksToReconcile(db);
  });

  async function setup(slugish: string, base: string | null = 'CAD') {
    const { agent, organizationId } = await registerOrganization(app, slugish);

    if (base) {
      await agent
        .patch('/v1/organization')
        .send({ baseCurrency: base })
        .expect(204);
    }

    const location = async (name: string) =>
      await createLocation(agent, {
        type: 'site',
        name,
        code: name.toUpperCase(),
      });

    const supplier = await createPartner(agent, {
      name: 'Cascade Botanicals',
      code: 'CASC',
    });

    return {
      agent,
      organizationId,
      shelf: await location('Shelf'),
      wip: await location('Blending'),
      supplier,
    };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function variant(
    s: Setup,
    sku: string,
    type: 'good' | 'material' | 'packaging' | 'equipment' = 'material',
    tracksLots = false,
  ) {
    return await createVariant(s.agent, {
      type,
      name: sku,
      variant: { sku, tracksLots },
    });
  }

  async function needsCost(s: Setup) {
    const res = await s.agent.get('/v1/costs/needs-cost').expect(200);
    return body<{ entries: { id: string; sku: string }[] }>(res).entries;
  }

  async function setCost(
    s: Setup,
    valuationId: string,
    cost: Price & { exchangeRate?: string },
    status = 200,
  ) {
    const res = await s.agent
      .put(`/v1/costs/valuations/${valuationId}`)
      .send(cost)
      .expect(status);

    return body<{ cost: CorrectedCost }>(res).cost;
  }

  /**
   * A tracked blend at 38 a kilo in lot BF-2609 and untracked bottles at
   * 0.10, a recipe of 30 kg and 1000 bottles for 1000 units, and a run for
   * 1000 released from the shelf. Closing it consumes 30 × 38 + 1000 × 0.10
   * = 1240.00 of material.
   */
  async function releasedRun(s: Setup) {
    const output = await variant(s, 'FOCUS-60CT', 'good', true);
    const blend = await variant(s, 'BLEND-FOCUS', 'material', true);
    const bottle = await variant(s, 'BOTTLE-60', 'packaging');

    await buy(s, blend, '50', cad('38'), { code: 'BF-2609' });
    await buy(s, bottle, '1000', cad('0.10'));

    const bomId = body<{ bom: { id: string } }>(
      await s.agent
        .post('/v1/boms')
        .send({
          outputVariantId: output,
          outputQuantity: '1000',
          lines: [
            { componentVariantId: blend, quantity: '30' },
            { componentVariantId: bottle, quantity: '1000' },
          ],
        })
        .expect(201),
    ).bom.id;

    await s.agent.post(`/v1/boms/${bomId}/promote`).expect(204);

    const runId = body<{ productionOrder: { id: string } }>(
      await s.agent
        .post('/v1/production-orders')
        .send({
          outputVariantId: output,
          bomId,
          locationId: s.wip,
          quantityPlanned: '1000',
        })
        .expect(201),
    ).productionOrder.id;

    await s.agent
      .post(`/v1/production-orders/${runId}/release`)
      .send({ sourceLocationId: s.shelf })
      .expect(200);

    return { output, blend, bottle, runId };
  }

  async function runCost(s: Setup, runId: string) {
    const res = await s.agent.get(`/v1/costs/runs/${runId}`).expect(200);
    return body<{ runCost: RunCost }>(res).runCost;
  }

  describe('run close', () => {
    it('posts a batch its material cost at close', async () => {
      const s = await setup('alpha');
      const run = await releasedRun(s);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/output`)
        .send({ quantity: '980', lot: { code: 'FOC-1' } })
        .expect(201);

      // Before close nothing is consumed, so nothing is costed.
      expect(await runCost(s, run.runId)).toMatchObject({
        closed: false,
        materialCost: null,
        unitCost: null,
      });

      await s.agent
        .post(`/v1/production-orders/${run.runId}/close`)
        .send({})
        .expect(200);

      const cost = await runCost(s, run.runId);

      expect(cost).toMatchObject({
        closed: true,
        materialCost: '1240.000000',
        quantityProduced: '980.0000',
        // 1240 ÷ 980, rounded to six places.
        unitCost: '1.265306',
        provisional: false,
      });
      expect(cost.consumed).toEqual([
        {
          sku: 'BLEND-FOCUS',
          lotCode: 'BF-2609',
          quantity: '30.0000',
          value: '1140.000000',
        },
        {
          sku: 'BOTTLE-60',
          lotCode: null,
          quantity: '1000.0000',
          value: '100.000000',
        },
      ]);
      expect(cost.outputs).toEqual([
        { lotCode: 'FOC-1', quantity: '980.0000', value: '1240.000000' },
      ]);

      const pool = await poolOf(db, run.output, await lotIdOf(db, 'FOC-1'));
      expect(pool.quantity).toBe('980.0000');
      expect(pool.value).toBe('1240.000000');

      // The output's needs-cost row is cleared by the close.
      expect(await needsCost(s)).toEqual([]);
    });

    it('splits the cost between what is left and what already went', async () => {
      const s = await setup('alpha');
      const run = await releasedRun(s);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/output`)
        .send({ quantity: '980', lot: { code: 'FOC-1' } })
        .expect(201);

      const lotId = await lotIdOf(db, 'FOC-1');

      // 400 leave before close, at the pool's average of zero.
      const early = await move(s, {
        variantId: run.output,
        lotId,
        fromLocationId: s.wip,
        quantity: '400',
        reason: 'shipment',
      });
      expect((await valuationOf(db, early)).value).toBe('0.000000');

      await s.agent
        .post(`/v1/production-orders/${run.runId}/close`)
        .send({})
        .expect(200);

      // 1240 × 580 ÷ 980 stays; the rest belongs to the 400 that went.
      const pool = await poolOf(db, run.output, lotId);
      expect(pool.quantity).toBe('580.0000');
      expect(pool.value).toBe('733.877551');

      const [issued] = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.kind, 'issued'));
      expect(issued.value).toBe('506.122449');
      expect(issued.referenceId).toBe(run.runId);

      // Together they are the batch's cost, to the millionth.
      expect((await runCost(s, run.runId)).outputs).toEqual([
        { lotCode: 'FOC-1', quantity: '980.0000', value: '1240.000000' },
      ]);
      await expectCostToFollow(db, {
        variantId: run.output,
        change: '1240.000000',
        most: { value: '1240.000000', quantity: '980' },
      });
    });

    it('has a material cost and no unit cost when nothing was made', async () => {
      const s = await setup('alpha');
      const run = await releasedRun(s);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/close`)
        .send({})
        .expect(200);

      expect(await runCost(s, run.runId)).toMatchObject({
        closed: true,
        materialCost: '1240.000000',
        unitCost: null,
        outputs: [],
      });

      const closeRows = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.kind, 'run_close'));
      expect(closeRows).toEqual([]);
    });
  });

  describe('setting a cost', () => {
    it('revalues what is held and records what has gone', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      const receipt = await buy(s, scoop, '10', cad('2'));

      await move(s, {
        variantId: scoop,
        fromLocationId: s.shelf,
        quantity: '4',
        reason: 'shipment',
      });

      // Supplier's bill says 3, not 2: 10 more in all, 6 of it still here.
      const cost = await setCost(
        s,
        (await valuationOf(db, receipt)).id,
        cad('3'),
      );

      expect(cost).toMatchObject({
        value: '30.000000',
        held: '6.000000',
        issued: '4.000000',
      });

      const pool = await poolOf(db, scoop);
      expect(pool.quantity).toBe('6.0000');
      expect(pool.value).toBe('18.000000');
      await expectCostToFollow(db, {
        variantId: scoop,
        change: '10.000000',
        most: each('3'),
        answer: cost,
      });

      // Corrected back again, measured from what it carries now.
      const back = await setCost(
        s,
        (await valuationOf(db, receipt)).id,
        cad('2'),
      );
      expect(back).toMatchObject({
        value: '20.000000',
        held: '-6.000000',
        issued: '-4.000000',
      });
      await expectCostToFollow(db, {
        variantId: scoop,
        change: '-10.000000',
        most: each('2'),
        answer: back,
      });
    });

    it('clears a receipt from the needs-cost list', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      const byHand = await move(s, {
        variantId: scoop,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'receipt',
      });
      const valuation = await valuationOf(db, byHand);

      expect((await needsCost(s)).map((entry) => entry.id)).toEqual([
        valuation.id,
      ]);

      await setCost(s, valuation.id, cad('2'));

      expect(await needsCost(s)).toEqual([]);
      expect((await poolOf(db, scoop)).value).toBe('10.000000');
    });

    it('converts a foreign cost at the rate on file, or the rate given', async () => {
      const s = await setup('alpha');
      const extract = await variant(s, 'EXTRACT');

      const receipt = await buy(s, extract, '100', usd('0.25'));
      const valuation = await valuationOf(db, receipt);

      // No rate yet, and none given.
      await setCost(s, valuation.id, usd('0.25'), 409);

      await s.agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'USD', rateDate: '2000-01-01', rate: '1.37' })
        .expect(200);

      expect(await setCost(s, valuation.id, usd('0.25'))).toMatchObject({
        value: '34.250000',
      });

      // A rate given with the cost wins over the one on file.
      expect(
        await setCost(s, valuation.id, { ...usd('0.25'), exchangeRate: '1.4' }),
      ).toMatchObject({ value: '35.000000' });

      expect(await needsCost(s)).toEqual([]);
    });

    /**
     * A correction converts at the rate for the day the stock arrived where
     * the organization is (ADR-048, ADR-072). Two receipts made together, in
     * Pago Pago and in Kiritimati, arrived a day or two apart, and UTC's day
     * is the wrong one for at least one of them.
     */
    it("converts at the rate for the day it arrived, in the organization's zone", async () => {
      for (const [slug, zone, value] of [
        ['alpha', PAGO_PAGO, '32.500000'],
        ['beta', KIRITIMATI, '35.000000'],
      ] as const) {
        const s = await setup(slug);
        await s.agent
          .patch('/v1/organization')
          .send({ timeZone: zone })
          .expect(204);
        const extract = await variant(s, 'EXTRACT');

        await clearOfMidnight([KIRITIMATI, PAGO_PAGO]);
        await db.insert(exchangeRates).values([
          {
            organizationId: s.organizationId,
            currency: 'USD',
            rateDate: todayIn(PAGO_PAGO),
            rate: '1.30',
          },
          {
            organizationId: s.organizationId,
            currency: 'USD',
            rateDate: todayIn(KIRITIMATI),
            rate: '1.40',
          },
        ]);
        // By hand, with no price: it waits for the cost.
        const receipt = await move(s, {
          variantId: extract,
          toLocationId: s.shelf,
          quantity: '100',
          reason: 'receipt',
        });
        const valuation = await valuationOf(db, receipt);

        expect(await setCost(s, valuation.id, usd('0.25'))).toMatchObject({
          value,
        });
      }
    });

    it('refuses a cost where the value comes from somewhere else', async () => {
      const s = await setup('alpha');
      const run = await releasedRun(s);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/output`)
        .send({ quantity: '980', lot: { code: 'FOC-1' } })
        .expect(201);

      const [output] = await db
        .select()
        .from(stockMovements)
        .where(eq(stockMovements.reason, 'production'));

      await setCost(s, (await valuationOf(db, output.id)).id, cad('1'), 409);

      // Release moved every bottle to the run's location.
      const shipped = await move(s, {
        variantId: run.bottle,
        fromLocationId: s.wip,
        quantity: '1',
        reason: 'shipment',
      });

      await setCost(s, (await valuationOf(db, shipped)).id, cad('1'), 409);
    });

    it('refuses a rate on a price already in the base currency', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');
      const receipt = await buy(s, scoop, '10', cad('2'));

      await setCost(
        s,
        (await valuationOf(db, receipt)).id,
        { ...cad('2'), exchangeRate: '1' },
        400,
      );
    });

    it('is not found from another organization', async () => {
      const alpha = await setup('alpha');
      const beta = await setup('beta');
      const scoop = await variant(alpha, 'SCOOP');
      const receipt = await buy(alpha, scoop, '10', cad('2'));

      await setCost(beta, (await valuationOf(db, receipt)).id, cad('3'), 404);
    });
  });

  /**
   * A pool with any stock still waiting for a cost gives no average
   * (ADR-048, amended by ADR-094, R22; #650): stock counted into it waits
   * too, rather than riding at an average worked out over units valued at
   * nothing, and is given its cost on its own line.
   */
  describe('stock counted in while its pool waits for a cost (#650)', () => {
    /** A found count onto the shelf, as Count it in… writes it. */
    async function countedIn(
      s: Setup,
      found: { variantId: string; lotId?: string; quantity: string },
    ) {
      const res = await s.agent
        .post('/v1/stock/movements')
        .send({
          ...found,
          toLocationId: s.shelf,
          reason: 'adjustment',
          reasonDetail: 'found',
          note: 'A box found behind the cartons at the count',
        })
        .expect(201);

      return body<{ movement: { id: string }; needsCost: boolean }>(res);
    }

    it('counts found stock into a lot whose receipt waits for a cost as waiting too, listed, and costed on its own line', async () => {
      const s = await setup('alpha');
      const vitc = await variant(s, 'VITC-100', 'material', true);

      // Received by hand, with no price: the 100 wait for a cost.
      const receipt = await move(s, {
        variantId: vitc,
        toLocationId: s.shelf,
        quantity: '100',
        reason: 'receipt',
        lot: { code: 'L1' },
      });
      const lotId = await lotIdOf(db, 'L1');

      const found = await countedIn(s, {
        variantId: vitc,
        lotId,
        quantity: '12',
      });

      expect(found.needsCost).toBe(true);
      const receiptRow = await valuationOf(db, receipt);
      const foundRow = await valuationOf(db, found.movement.id);
      expect(foundRow).toMatchObject({ value: '0.000000', needsCost: true });
      expect((await needsCost(s)).map((entry) => entry.id).sort()).toEqual(
        [receiptRow.id, foundRow.id].sort(),
      );

      // Each at 5.00: 560.00 for the 112, never 500.00 at 4.46 a unit.
      await setCost(s, receiptRow.id, cad('5'));
      await setCost(s, foundRow.id, cad('5'));

      expect(await needsCost(s)).toEqual([]);
      expect(await poolOf(db, vitc, lotId)).toMatchObject({
        quantity: '112.0000',
        value: '560.000000',
      });
    });

    it('takes no average from a pool only part of whose stock waits, and takes one again once none does (2a)', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      await buy(s, scoop, '10', cad('2'));
      const waiting = await move(s, {
        variantId: scoop,
        toLocationId: s.shelf,
        quantity: '10',
        reason: 'receipt',
      });

      // The pool's 20.00 for 20 would give 1.00 a unit, half what any cost.
      const found = await countedIn(s, { variantId: scoop, quantity: '5' });

      expect(found.needsCost).toBe(true);
      const foundRow = await valuationOf(db, found.movement.id);
      expect(foundRow).toMatchObject({ value: '0.000000', needsCost: true });

      await setCost(s, (await valuationOf(db, waiting)).id, cad('2'));
      await setCost(s, foundRow.id, cad('2'));

      const again = await countedIn(s, { variantId: scoop, quantity: '5' });

      expect(again.needsCost).toBe(false);
      expect(await valuationOf(db, again.movement.id)).toMatchObject({
        value: '10.000000',
        needsCost: false,
      });
    });
  });

  /**
   * A late cost follows stock moved to another lot (ADR-094, D5). Of each lot
   * change out of the pool after the stock arrived, the acquisition's part
   * is the moved quantity times its units still in the pool just before,
   * over what the pool held then; that part carries its share to the row in,
   * which spreads it again, and what remains splits as ADR-048 splits it.
   * Each test also makes the three checks of a cost that follows stock
   * (expectCostToFollow, R2): no lot over its units at the cost given, the
   * parts adding up to it in the answer and in the rows it wrote, and each
   * pool its rows.
   */
  describe('a late cost following stock moved to another lot (ADR-094, D5)', () => {
    const tracked = (s: Setup) => variant(s, 'VITC-90', 'good', true);

    /** Received by hand with no price into a lot typed as printed: it waits. */
    async function unpriced(
      s: Setup,
      variantId: string,
      quantity: string,
      code: string,
    ) {
      const movementId = await move(s, {
        variantId,
        toLocationId: s.shelf,
        quantity,
        reason: 'receipt',
        lot: { code },
      });
      return (await valuationOf(db, movementId)).id;
    }

    async function ship(
      s: Setup,
      variantId: string,
      lotId: string,
      quantity: string,
    ) {
      await move(s, {
        variantId,
        lotId,
        fromLocationId: s.shelf,
        quantity,
        reason: 'shipment',
      });
    }

    /** Move to another lot: one of the item's by id, or a new code. */
    async function moveToLot(
      s: Setup,
      lotId: string,
      quantity: string,
      to: { toLotId: string } | { lot: { code: string } },
      at = s.shelf,
    ) {
      const res = await s.agent
        .post(`/v1/stock/lots/${lotId}/lot-changes`)
        .send({
          locationId: at,
          quantity,
          note: 'Two runs in one delivery',
          ...to,
        })
        .expect(201);
      return body<{
        movement: { id: string };
        toLot: { id: string; code: string };
        needsCost: boolean;
      }>(res);
    }

    /** A lot change's value row into the lot it enters. */
    async function rowInOf(movementId: string) {
      const rows = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.movementId, movementId));
      return rows.find((row) => !row.quantity.startsWith('-'))!;
    }

    async function waitingIds(s: Setup) {
      return (await needsCost(s)).map((entry) => entry.id);
    }

    async function issuedRows() {
      const rows = await db
        .select({
          lotId: stockValuations.lotId,
          value: stockValuations.value,
        })
        .from(stockValuations)
        .where(eq(stockValuations.kind, 'issued'));
      return rows;
    }

    async function total(s: Setup) {
      const res = await s.agent.get('/v1/costs/valuation/totals').expect(200);
      return body<{ total: string }>(res).total;
    }

    async function historyOf(s: Setup, lotId: string) {
      const res = await s.agent.get(`/v1/costs/lots/${lotId}`).expect(200);
      return body<{ lotCost: { entries: Record<string, unknown>[] } }>(res)
        .lotCost.entries;
    }

    it('carries 40.00 of 80.00 to the 50 moved, 20 of them the receipt’s by what the lot held: each lot 100.00 for 50, nothing issued, Stock value 200.00', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await buy(s, vitc, '60', cad('2.00'), { code: 'A' });
      const receipt = await unpriced(s, vitc, '40', 'A');
      const a = await lotIdOf(db, 'A');

      const moved = await moveToLot(s, a, '50', { lot: { code: 'B' } });
      const b = moved.toLot.id;
      expect(moved.needsCost).toBe(true);
      expect(await poolOf(db, vitc, b)).toMatchObject({
        quantity: '50.0000',
        value: '60.000000',
      });

      const cost = await setCost(s, receipt, cad('2.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '80.000000',
        held: '40.000000',
        issued: '0.000000',
        followed: [{ lotId: b, lotCode: 'B', value: '40.000000' }],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '50.0000',
        value: '100.000000',
      });
      expect(await poolOf(db, vitc, b)).toMatchObject({
        quantity: '50.0000',
        value: '100.000000',
      });
      expect(await issuedRows()).toEqual([]);
      // Lot B waits no longer, and nothing else does.
      expect(await needsCost(s)).toEqual([]);
      expect(await total(s)).toBe('200.000000');
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '80.000000',
        most: each('2.00'),
        answer: cost,
      });

      // Each lot's history adds up and says where the rest went: the whole
      // cost given, the part carried on to B; in B, the part that came.
      expect((await historyOf(s, a)).slice(0, 2)).toEqual([
        expect.objectContaining({
          kind: 'correction',
          value: '-40.000000',
          carried: 'to',
          otherLotId: b,
          otherLotCode: 'B',
        }),
        expect.objectContaining({
          kind: 'correction',
          value: '80.000000',
          unitPrice: '2.0000',
          carried: null,
          otherLotId: null,
        }),
      ]);
      expect(await historyOf(s, b)).toEqual([
        expect.objectContaining({
          kind: 'correction',
          value: '40.000000',
          carried: 'from',
          otherLotId: a,
          otherLotCode: 'A',
        }),
        expect.objectContaining({
          kind: 'lot_change',
          value: '60.000000',
          carried: null,
          otherLotId: a,
        }),
      ]);
    });

    it('splits what stays after the move as ADR-048 does: 10 received, 5 shipped, 2 of the 5 left moved, costed at 10.00, 20.00 follows, 30.00 held, 50.00 issued', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      await ship(s, vitc, a, '5');
      const moved = await moveToLot(s, a, '2', { lot: { code: 'B' } });

      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '30.000000',
        issued: '50.000000',
        followed: [{ lotId: moved.toLot.id, lotCode: 'B', value: '20.000000' }],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '3.0000',
        value: '30.000000',
      });
      expect(await poolOf(db, vitc, moved.toLot.id)).toMatchObject({
        quantity: '2.0000',
        value: '20.000000',
      });
      // What went with the 5 shipped alone is issued; the part carried never.
      expect(await issuedRows()).toEqual([{ lotId: a, value: '50.000000' }]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    it('values both lots of one receipt part moved and costed once, nothing issued', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '100', 'A');
      const a = await lotIdOf(db, 'A');
      const moved = await moveToLot(s, a, '30', { lot: { code: 'B' } });

      const cost = await setCost(s, receipt, cad('2.00'));
      expect(cost).toMatchObject({
        held: '140.000000',
        issued: '0.000000',
        followed: [{ lotCode: 'B', value: '60.000000' }],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '70.0000',
        value: '140.000000',
      });
      expect(await poolOf(db, vitc, moved.toLot.id)).toMatchObject({
        quantity: '30.0000',
        value: '60.000000',
      });
      expect(await issuedRows()).toEqual([]);
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '200.000000',
        most: each('2.00'),
        answer: cost,
      });
    });

    it('gives the second lot the same share whatever the first ships after the move', async () => {
      /**
       * The first example's lots, under codes of their own in each
       * organization, the first shipping 40 after the move, or nothing.
       */
      async function costed(
        slugish: string,
        shipped: string | null,
        [first, second]: [string, string],
      ) {
        const s = await setup(slugish);
        const vitc = await tracked(s);
        await buy(s, vitc, '60', cad('2.00'), { code: first });
        const receipt = await unpriced(s, vitc, '40', first);
        const a = await lotIdOf(db, first);
        const moved = await moveToLot(s, a, '50', { lot: { code: second } });
        if (shipped) await ship(s, vitc, a, shipped);

        const cost = await setCost(s, receipt, cad('2.00'));
        // The first lot too, which holds its share of the cost and no more
        // (#677).
        await expectCostToFollow(db, {
          variantId: vitc,
          change: '80.000000',
          most: each('2.00'),
          answer: cost,
        });
        return {
          cost,
          second: await poolOf(db, vitc, moved.toLot.id),
        };
      }

      const without = await costed('alpha', null, ['A', 'B']);
      const after = await costed('beta', '40', ['C', 'D']);

      expect(after.cost.followed.map((lot) => lot.value)).toEqual([
        '40.000000',
      ]);
      expect(after.cost.followed.map((lot) => lot.value)).toEqual(
        without.cost.followed.map((lot) => lot.value),
      );
      expect(after.second.value).toBe(without.second.value);
      expect(after.second.value).toBe('100.000000');
      // The shipment changes the first lot's split alone: of its 50, the
      // receipt's 20, 40 shipped took 16 of them, and the 4 left hold
      // their share (#677).
      expect(after.cost).toMatchObject({
        held: '8.000000',
        issued: '32.000000',
      });
    });

    it('follows a chain of two moves, each lot waiting until the first receipt is costed', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '100', 'A');
      const a = await lotIdOf(db, 'A');
      const toB = await moveToLot(s, a, '40', { lot: { code: 'B' } });
      const toC = await moveToLot(s, toB.toLot.id, '10', {
        lot: { code: 'C' },
      });
      expect(toC.needsCost).toBe(true);
      expect((await waitingIds(s)).sort()).toEqual(
        [
          receipt,
          (await rowInOf(toB.movement.id)).id,
          (await rowInOf(toC.movement.id)).id,
        ].sort(),
      );

      const cost = await setCost(s, receipt, cad('1.00'));
      expect(cost).toMatchObject({
        held: '60.000000',
        issued: '0.000000',
        followed: [
          { lotCode: 'B', value: '30.000000' },
          { lotCode: 'C', value: '10.000000' },
        ],
      });

      expect(await poolOf(db, vitc, toB.toLot.id)).toMatchObject({
        quantity: '30.0000',
        value: '30.000000',
      });
      expect(await poolOf(db, vitc, toC.toLot.id)).toMatchObject({
        quantity: '10.0000',
        value: '10.000000',
      });
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('1.00'),
        answer: cost,
      });
    });

    it('follows stock moved and moved back, the part back held in the first lot', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      const out = await moveToLot(s, a, '4', { lot: { code: 'B' } });
      await moveToLot(s, out.toLot.id, '2', { toLotId: a });

      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '80.000000',
        issued: '0.000000',
        followed: [{ lotId: out.toLot.id, lotCode: 'B', value: '20.000000' }],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '8.0000',
        value: '80.000000',
      });
      expect(await poolOf(db, vitc, out.toLot.id)).toMatchObject({
        quantity: '2.0000',
        value: '20.000000',
      });
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    it('holds no more than the stock back in the first lot: 10 received, 6 shipped, the 4 left moved away and back, costed at 10.00, 40.00 held and 60.00 issued', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      await ship(s, vitc, a, '6');
      const out = await moveToLot(s, a, '4', { lot: { code: 'B' } });
      await moveToLot(s, out.toLot.id, '4', { toLotId: a });

      // The 4 back are the receipt's 4 that left; the 6 it had besides
      // were shipped, so they are not counted again as the 4 now there.
      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '40.000000',
        issued: '60.000000',
        followed: [],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '4.0000',
        value: '40.000000',
      });
      expect(await poolOf(db, vitc, out.toLot.id)).toMatchObject({
        quantity: '0.0000',
        value: '0.000000',
      });
      expect(await issuedRows()).toEqual([{ lotId: a, value: '60.000000' }]);
      expect(await total(s)).toBe('40.000000');
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    /**
     * A sale of one lot, confirmed and shipped from the shelf: its order's
     * line and its shipment, for a return or a void.
     */
    async function sold(
      s: Setup,
      variantId: string,
      lotId: string,
      quantity: string,
    ) {
      const customer = await createPartner(s.agent, {
        name: 'Northside Pharmacy',
        code: 'NORTH',
      });
      const order = body<{ order: { id: string; lines: { id: string }[] } }>(
        await s.agent
          .post('/v1/orders')
          .send({
            partnerId: customer,
            direction: 'sale',
            lines: [{ variantId, quantityOrdered: quantity, ...cad('10') }],
          })
          .expect(201),
      ).order;
      await s.agent
        .patch(`/v1/orders/${order.id}`)
        .send({ status: 'confirmed' })
        .expect(204);
      const shipment = body<{ shipment: { id: string } }>(
        await s.agent
          .post(`/v1/orders/${order.id}/shipments`)
          .send({
            fromLocationId: s.shelf,
            lines: [
              {
                lineId: order.lines[0].id,
                quantity,
                lots: [{ lotId, quantity }],
              },
            ],
          })
          .expect(201),
      ).shipment;
      return {
        orderId: order.id,
        lineId: order.lines[0].id,
        shipmentId: shipment.id,
      };
    }

    /** Part of a sale's lot back on its order, onto the shelf. */
    async function returned(
      s: Setup,
      sale: Awaited<ReturnType<typeof sold>>,
      lotId: string,
      quantity: string,
    ) {
      await s.agent
        .post(`/v1/orders/${sale.orderId}/returns`)
        .send({
          toLocationId: s.shelf,
          reason: 'Damaged in transit',
          lines: [{ lineId: sale.lineId, lots: [{ lotId, quantity }] }],
        })
        .expect(201);
    }

    it('carries each unit once, through a lot it left and came back to: 10 received, 6 shipped, the 4 left moved A → B → A → C, costed at 10.00, C holds 40.00 and 60.00 is issued (#678)', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      await ship(s, vitc, a, '6');
      const toB = await moveToLot(s, a, '4', { lot: { code: 'B' } });
      await moveToLot(s, toB.toLot.id, '4', { toLotId: a });
      const toC = await moveToLot(s, a, '4', { lot: { code: 'C' } });
      const c = toC.toLot.id;

      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '0.000000',
        issued: '60.000000',
        followed: [{ lotId: c, lotCode: 'C', value: '40.000000' }],
      });

      expect(await poolOf(db, vitc, c)).toMatchObject({
        quantity: '4.0000',
        value: '40.000000',
      });
      for (const lotId of [a, toB.toLot.id]) {
        expect(await poolOf(db, vitc, lotId)).toMatchObject({
          quantity: '0.0000',
          value: '0.000000',
        });
      }
      expect(await issuedRows()).toEqual([{ lotId: a, value: '60.000000' }]);
      expect(await total(s)).toBe('40.000000');
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    it('keeps a lot’s share of a late cost and no more: 60 at 2.00 and 40 with no price, 90 shipped, the 40 costed at 2.00, 8.00 held, 72.00 issued, the 10 left holding 20.00 (#677)', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await buy(s, vitc, '60', cad('2.00'), { code: 'A' });
      const receipt = await unpriced(s, vitc, '40', 'A');
      const a = await lotIdOf(db, 'A');
      await ship(s, vitc, a, '90');

      const cost = await setCost(s, receipt, cad('2.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '80.000000',
        held: '8.000000',
        issued: '72.000000',
        followed: [],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '10.0000',
        value: '20.000000',
      });
      expect(await issuedRows()).toEqual([{ lotId: a, value: '72.000000' }]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '80.000000',
        most: each('2.00'),
        answer: cost,
      });
    });

    it('issues nothing for a shipment voided before the cost came: 10 with no price, 6 shipped and voided, costed at 10.00, 100.00 held', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      const sale = await sold(s, vitc, a, '6');
      await s.agent
        .post(`/v1/orders/${sale.orderId}/shipments/${sale.shipmentId}/void`)
        .send({ reason: 'Recorded before the box left' })
        .expect(204);

      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '100.000000',
        issued: '0.000000',
        followed: [],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '10.0000',
        value: '100.000000',
      });
      expect(await issuedRows()).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    it('brings back the share of what a return brings back: 10 with no price, 6 shipped, 3 of them returned on the order, costed at 10.00, 70.00 held and 30.00 issued', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const receipt = await unpriced(s, vitc, '10', 'A');
      const a = await lotIdOf(db, 'A');
      const sale = await sold(s, vitc, a, '6');
      await returned(s, sale, a, '3');

      const cost = await setCost(s, receipt, cad('10.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '100.000000',
        held: '70.000000',
        issued: '30.000000',
        followed: [],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '7.0000',
        value: '70.000000',
      });
      expect(await issuedRows()).toEqual([{ lotId: a, value: '30.000000' }]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '100.000000',
        most: each('10.00'),
        answer: cost,
      });
    });

    it('brings back a return’s part of what its shipment took from a mixed lot: 9 of the 90 back at 1.20 before the cost, 64.80 issued, the 19 on hand holding 38.00', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await buy(s, vitc, '60', cad('2.00'), { code: 'A' });
      const receipt = await unpriced(s, vitc, '40', 'A');
      const a = await lotIdOf(db, 'A');
      const sale = await sold(s, vitc, a, '90');
      await returned(s, sale, a, '9');
      // Shipped at the lot's average, 120.00 for 100, and back at it.
      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '19.0000',
        value: '22.800000',
      });

      // Of the 72.00 the shipment's 36 of the 40 carry, 9 of its 90 take
      // back 7.20.
      const cost = await setCost(s, receipt, cad('2.00'));
      expect(cost).toEqual({
        valuationId: receipt,
        value: '80.000000',
        held: '15.200000',
        issued: '64.800000',
        followed: [],
      });

      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '19.0000',
        value: '38.000000',
      });
      expect(await issuedRows()).toEqual([{ lotId: a, value: '64.800000' }]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '80.000000',
        most: each('2.00'),
        answer: cost,
      });
    });

    it('carries a correction after the move, upward and then downward, by what the lot held when it moved', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await buy(s, vitc, '60', cad('2.00'), { code: 'A' });
      const receipt = await unpriced(s, vitc, '40', 'A');
      const a = await lotIdOf(db, 'A');

      // Costed before the move: the move carries it at the lot's average.
      const first = await setCost(s, receipt, cad('2.00'));
      expect(first).toMatchObject({ held: '80.000000', followed: [] });
      const moved = await moveToLot(s, a, '50', { lot: { code: 'B' } });
      const b = moved.toLot.id;
      expect(moved.needsCost).toBe(false);
      expect(await poolOf(db, vitc, b)).toMatchObject({
        value: '100.000000',
      });

      // 3.00: 40.00 more, half of it with the 20 of the receipt's moved.
      const up = await setCost(s, receipt, cad('3.00'));
      expect(up).toMatchObject({
        value: '120.000000',
        held: '20.000000',
        issued: '0.000000',
        followed: [{ lotId: b, value: '20.000000' }],
      });
      expect(await poolOf(db, vitc, a)).toMatchObject({
        value: '120.000000',
      });
      expect(await poolOf(db, vitc, b)).toMatchObject({
        value: '120.000000',
      });
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '40.000000',
        most: each('3.00'),
        answer: up,
      });

      // 1.00: 80.00 less, measured from all it carries now, B's part too.
      const down = await setCost(s, receipt, cad('1.00'));
      expect(down).toMatchObject({
        value: '40.000000',
        held: '-40.000000',
        issued: '0.000000',
        followed: [{ lotId: b, value: '-40.000000' }],
      });
      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '50.0000',
        value: '80.000000',
      });
      expect(await poolOf(db, vitc, b)).toMatchObject({
        quantity: '50.0000',
        value: '80.000000',
      });
      expect(await total(s)).toBe('160.000000');
      // The 60 bought at 2.00 are the dearest left.
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '-80.000000',
        most: each('2.00'),
        answer: down,
      });
    });

    it('carries a batch’s cost at close to its output moved to another lot before it', async () => {
      const s = await setup('alpha');
      const run = await releasedRun(s);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/output`)
        .send({ quantity: '980', lot: { code: 'FOC-1' } })
        .expect(201);
      const first = await lotIdOf(db, 'FOC-1');
      const moved = await moveToLot(
        s,
        first,
        '280',
        { lot: { code: 'FOC-2' } },
        s.wip,
      );
      expect(moved.needsCost).toBe(true);

      await s.agent
        .post(`/v1/production-orders/${run.runId}/close`)
        .send({})
        .expect(200);

      // 1240 × 280 ÷ 980 follows the 280; the rest stays with the 700.
      expect(await poolOf(db, run.output, first)).toMatchObject({
        quantity: '700.0000',
        value: '885.714286',
      });
      expect(await poolOf(db, run.output, moved.toLot.id)).toMatchObject({
        quantity: '280.0000',
        value: '354.285714',
      });
      expect(await issuedRows()).toEqual([]);
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: run.output,
        change: '1240.000000',
        most: { value: '1240.000000', quantity: '980' },
      });

      // The batch's output still carries the whole of its cost.
      expect(await runCost(s, run.runId)).toMatchObject({
        materialCost: '1240.000000',
        unitCost: '1.265306',
        outputs: [
          { lotCode: 'FOC-1', quantity: '980.0000', value: '1240.000000' },
        ],
      });
    });

    it('keeps the stock moved waiting while anything the first lot waited for still does, its pool taking no average, and not after', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      const one = await unpriced(s, vitc, '30', 'A');
      const two = await unpriced(s, vitc, '20', 'A');
      const a = await lotIdOf(db, 'A');
      const moved = await moveToLot(s, a, '10', { lot: { code: 'B' } });
      const rowIn = (await rowInOf(moved.movement.id)).id;

      // The first costed: 6 of the 10 moved were its, by what the lot held.
      const costedOne = await setCost(s, one, cad('1.00'));
      expect(costedOne.followed).toMatchObject([{ value: '6.000000' }]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '30.000000',
        most: each('1.00'),
        answer: costedOne,
      });
      expect(await waitingIds(s)).toContain(rowIn);

      // Its pool still gives no average (#650): stock counted in waits too.
      const found = body<{ movement: { id: string }; needsCost: boolean }>(
        await s.agent
          .post('/v1/stock/movements')
          .send({
            variantId: vitc,
            lotId: moved.toLot.id,
            toLocationId: s.shelf,
            quantity: '1',
            reason: 'adjustment',
            reasonDetail: 'found',
            note: 'A box found behind the cartons at the count',
          })
          .expect(201),
      );
      expect(found.needsCost).toBe(true);

      // The second costed: the other 4, and the stock moved waits no more.
      const costedTwo = await setCost(s, two, cad('2.00'));
      expect(costedTwo.followed).toMatchObject([{ value: '8.000000' }]);
      expect(await waitingIds(s)).toEqual([
        (await valuationOf(db, found.movement.id)).id,
      ]);
      expect(await poolOf(db, vitc, moved.toLot.id)).toMatchObject({
        quantity: '11.0000',
        value: '14.000000',
      });
      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '40.0000',
        value: '56.000000',
      });
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '40.000000',
        most: each('2.00'),
        answer: costedTwo,
      });
    });

    it('refuses a cost by hand on the stock moved in, naming the lot to cost', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await unpriced(s, vitc, '40', 'A');
      const moved = await moveToLot(s, await lotIdOf(db, 'A'), '10', {
        lot: { code: 'B' },
      });
      const rowIn = await rowInOf(moved.movement.id);
      expect(rowIn.needsCost).toBe(true);

      const res = await s.agent
        .put(`/v1/costs/valuations/${rowIn.id}`)
        .send(cad('2.00'))
        .expect(409);
      expect(body<{ message: string }>(res).message).toBe(
        said('en', 'stock.stockMovedInFromLot', { code: 'A' }),
      );
      expect(
        await db
          .select()
          .from(stockValuations)
          .where(eq(stockValuations.kind, 'correction')),
      ).toEqual([]);
      // Refused, so no cost was given and no lot holds any.
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '0',
        most: each('0'),
      });
    });

    /**
     * A cost given while stock moves out of the same lot. The first lot's
     * pool is held, so the cost stops half way, having taken the lot it
     * may carry to; the move then waits for that lot. Each takes the lots
     * in one order, so neither waits on the other: the cost carries to the
     * first move, and the second takes the lot's average once it is costed.
     * The second lot is the older, so taking the first lot's pool first
     * would be the other order.
     */
    it('gives a cost and a move at once, neither waiting on the other (two at once)', async () => {
      const s = await setup('alpha');
      const vitc = await tracked(s);
      await buy(s, vitc, '10', cad('1.00'), { code: 'B' });
      await buy(s, vitc, '60', cad('2.00'), { code: 'A' });
      const receipt = await unpriced(s, vitc, '40', 'A');
      const a = await lotIdOf(db, 'A');
      const b = await lotIdOf(db, 'B');
      expect(b < a).toBe(true);
      await moveToLot(s, a, '50', { toLotId: b });

      let release!: () => void;
      const released = new Promise<void>((resolve) => (release = resolve));
      let held!: () => void;
      const holding = new Promise<void>((resolve) => (held = resolve));
      const holder = db.transaction(async (tx) => {
        await tx.execute(sql`
          select 1 from valuation_pools
          where variant_id = ${vitc}::uuid and lot_id = ${a}::uuid
          for update
        `);
        held();
        await released;
      });
      await holding;

      const costing = s.agent
        .put(`/v1/costs/valuations/${receipt}`)
        .send(cad('2.00'))
        .then((res) => res);
      await waitersReach(1);
      const moving = s.agent
        .post(`/v1/stock/lots/${a}/lot-changes`)
        .send({
          locationId: s.shelf,
          quantity: '10',
          toLotId: b,
          note: 'Two runs in one delivery',
        })
        .then((res) => res);
      await waitersReach(2);
      release();
      await holder;

      const [costed, moved] = await Promise.all([costing, moving]);
      expect(costed.status).toBe(200);
      expect(moved.status).toBe(201);
      expect(body<{ cost: CorrectedCost }>(costed).cost.followed).toEqual([
        { lotId: b, lotCode: 'B', value: '40.000000' },
      ]);
      expect(body<{ needsCost: boolean }>(moved).needsCost).toBe(false);

      // 10 at 1.00, 60 at 2.00 and 40 at 2.00: 210.00, 130.00 of it in B.
      expect(await poolOf(db, vitc, b)).toMatchObject({
        quantity: '70.0000',
        value: '130.000000',
      });
      expect(await poolOf(db, vitc, a)).toMatchObject({
        quantity: '40.0000',
        value: '80.000000',
      });
      expect(await needsCost(s)).toEqual([]);
      await expectCostToFollow(db, {
        variantId: vitc,
        change: '80.000000',
        most: each('2.00'),
        answer: body<{ cost: CorrectedCost }>(costed).cost,
      });
    });

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

  describe('exchange rates', () => {
    it('keeps one rate a day, the latest entered', async () => {
      const s = await setup('alpha');

      for (const rate of ['1.36', '1.37']) {
        await s.agent
          .put('/v1/costs/exchange-rates')
          .send({ currency: 'USD', rateDate: '2026-09-28', rate })
          .expect(200);
      }

      const res = await s.agent.get('/v1/costs/exchange-rates').expect(200);
      expect(
        body<{ rates: { currency: string; rate: string }[] }>(res).rates,
      ).toMatchObject([{ currency: 'USD', rate: '1.37000000' }]);
    });

    it('refuses the base currency, and any rate before a base is set', async () => {
      const withBase = await setup('alpha');

      await withBase.agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'CAD', rateDate: '2026-09-28', rate: '1' })
        .expect(400);

      const without = await setup('beta', null);

      await without.agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'USD', rateDate: '2026-09-28', rate: '1.37' })
        .expect(409);
    });

    it('refuses a date that does not exist', async () => {
      const s = await setup('alpha');

      await s.agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'USD', rateDate: '2026-02-31', rate: '1.37' })
        .expect(400);
    });

    /**
     * A rate the dialog lets through, zero or past 8 places, is refused in
     * words a person acts on, never the field's API name (#148), and so is
     * one given with a cost.
     */
    it('refuses a rate of zero, or past 8 decimal places, in words', async () => {
      const s = await setup('alpha');

      for (const language of SUPPORTED_LOCALES) {
        for (const rate of ['0', '1.123456789']) {
          const refused = await s.agent
            .put('/v1/costs/exchange-rates')
            .set('Accept-Language', language)
            .send({ currency: 'USD', rateDate: '2026-09-28', rate })
            .expect(400);
          expect(body<{ message: string[] }>(refused).message).toEqual([
            said(language, 'validation.rate'),
          ]);
        }
      }

      const extract = await variant(s, 'EXTRACT');
      const valuation = await valuationOf(
        db,
        await buy(s, extract, '100', usd('0.25')),
      );
      for (const language of SUPPORTED_LOCALES) {
        const refused = await s.agent
          .put(`/v1/costs/valuations/${valuation.id}`)
          .set('Accept-Language', language)
          .send({ ...usd('0.25'), exchangeRate: '0' })
          .expect(400);
        expect(body<{ message: string[] }>(refused).message).toEqual([
          said(language, 'validation.exchangeRate'),
        ]);
      }
    });
  });

  describe('stock valuation', () => {
    it('totals what is on hand and says what is still waiting for a cost', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');
      const lid = await variant(s, 'LID');

      await buy(s, scoop, '10', cad('2'));
      await move(s, {
        variantId: lid,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'receipt',
      });

      expect(await valuationTotals(s, {})).toEqual({
        currency: 'CAD',
        total: '20.000000',
        provisional: true,
        pools: 2,
        count: 2,
      });

      const { entries } = await valuationPage(s, {});
      expect(entries).toMatchObject([
        { sku: 'LID', value: '0.000000', provisional: true },
        { sku: 'SCOOP', value: '20.000000', provisional: false },
      ]);
    });

    interface ValuationPage {
      entries: {
        sku: string;
        lotCode: string | null;
        value: string;
        provisional: boolean;
      }[];
      nextCursor: string | null;
    }

    interface ValuationTotals {
      currency: string | null;
      total: string;
      provisional: boolean;
      pools: number;
      count: number;
    }

    async function valuationPage(
      s: Setup,
      query: Record<string, string | number>,
    ) {
      return body<ValuationPage>(
        await s.agent.get('/v1/costs/valuation').query(query).expect(200),
      );
    }

    async function valuationTotals(s: Setup, query: Record<string, string>) {
      return body<ValuationTotals>(
        await s.agent
          .get('/v1/costs/valuation/totals')
          .query(query)
          .expect(200),
      );
    }

    /** Each pool on a page by its code, a lot's after a slash. */
    function poolsOn(page: ValuationPage) {
      return page.entries.map((pool) =>
        pool.lotCode ? `${pool.sku}/${pool.lotCode}` : pool.sku,
      );
    }

    /** Every page of a read, by its cursor, until there is no more. */
    async function everyPage(s: Setup, query: Record<string, string | number>) {
      const pages: ValuationPage[] = [];
      let cursor: string | null = null;
      do {
        const page = await valuationPage(s, {
          ...query,
          ...(cursor ? { cursor } : {}),
        });
        pages.push(page);
        cursor = page.nextCursor;
      } while (cursor);
      return pages;
    }

    /**
     * Five pools worth 82.00 in all, two of them waiting at nothing: a
     * scoop at 2.00 and a jar's two lots at 3.00 and 50.00, with a cap
     * and a lid received with no price.
     */
    async function fivePools(s: Setup) {
      const scoop = await variant(s, 'SCOOP');
      const jar = await variant(s, 'JAR', 'material', true);
      await buy(s, scoop, '10', cad('2'));
      await buy(s, jar, '4', cad('3'), { code: 'J-1' });
      await buy(s, jar, '1', cad('50'), { code: 'J-2' });
      for (const [sku, quantity] of [
        ['LID', '5'],
        ['CAP', '3'],
      ]) {
        await move(s, {
          variantId: await variant(s, sku),
          toLocationId: s.shelf,
          quantity,
          reason: 'receipt',
        });
      }
    }

    /**
     * Stock value by the page (ADR-094's amendment, R6): fifty pools at a
     * time, the next by the cursor, and nothing more; what the whole is
     * worth is the totals' read, which no page works out again.
     */
    it('reads every pool once over its pages, a page holding its rows and its cursor alone, and the export every pool (R6)', async () => {
      const s = await setup('alpha');
      await fivePools(s);

      const pages = await everyPage(s, { limit: 2 });
      expect(pages.map(poolsOn)).toEqual([
        ['CAP', 'JAR/J-1'],
        ['JAR/J-2', 'LID'],
        ['SCOOP'],
      ]);
      for (const page of pages) {
        expect(Object.keys(page).sort()).toEqual(['entries', 'nextCursor']);
      }

      // Fifty unless asked: one page holds them all.
      expect(await valuationPage(s, {})).toMatchObject({ nextCursor: null });

      // The export still writes every pool, by its code and lot.
      const exported = (
        await s.agent.get('/v1/costs/valuation/export').expect(200)
      ).text;
      expect(
        exported
          .trim()
          .split(/\r?\n/)
          .slice(1)
          .map((line) => line.split(',').slice(0, 2).filter(Boolean).join('/')),
      ).toEqual(['CAP', 'JAR/J-1', 'JAR/J-2', 'LID', 'SCOOP']);
    });

    it('finds a pool by its item’s name or code or by its lot’s code (R6)', async () => {
      const s = await setup('alpha');
      await fivePools(s);

      const lot = await valuationPage(s, { search: 'J-2' });
      expect(poolsOn(lot)).toEqual(['JAR/J-2']);
      expect(lot.nextCursor).toBeNull();

      const item = await everyPage(s, { search: 'jar', limit: 1 });
      expect(item.map(poolsOn)).toEqual([['JAR/J-1'], ['JAR/J-2']]);

      expect(
        poolsOn(await valuationPage(s, { search: 'sco', sort: '-value' })),
      ).toEqual(['SCOOP']);

      expect(await valuationPage(s, { search: 'zzz' })).toEqual({
        entries: [],
        nextCursor: null,
      });
    });

    /**
     * The totals, a read of their own (R6): what every pool is worth and
     * whether any of it is provisional, whatever the find, so the total is
     * never a sum of the rows read; how many pools there are, and how many
     * the find matches, which its pages hold together.
     */
    it('totals every pool whatever the find, and counts the pools the find matches, as many as its pages hold (R6)', async () => {
      const s = await setup('alpha');
      await fivePools(s);

      const whole = {
        currency: 'CAD',
        total: '82.000000',
        provisional: true,
        pools: 5,
      };
      for (const [search, count] of [
        ['', 5],
        ['J-2', 1],
        ['jar', 2],
        ['sco', 1],
        ['zzz', 0],
      ] as const) {
        const query: Record<string, string> = search ? { search } : {};
        expect(await valuationTotals(s, query)).toEqual({ ...whole, count });
        const pages = await everyPage(s, { ...query, limit: 2 });
        expect(pages.flatMap(poolsOn)).toHaveLength(count);
      }
    });

    it('sorts by the item, and by the value either way, the item breaking ties, over its pages (R6)', async () => {
      const s = await setup('alpha');
      await fivePools(s);

      const sorted = async (sort: string) =>
        (await everyPage(s, { sort, limit: 2 })).flatMap(poolsOn);

      expect(await sorted('item')).toEqual([
        'CAP',
        'JAR/J-1',
        'JAR/J-2',
        'LID',
        'SCOOP',
      ]);
      expect(await sorted('-value')).toEqual([
        'JAR/J-2',
        'SCOOP',
        'JAR/J-1',
        'CAP',
        'LID',
      ]);
      expect(await sorted('value')).toEqual([
        'CAP',
        'LID',
        'JAR/J-1',
        'SCOOP',
        'JAR/J-2',
      ]);
    });

    it('refuses a cursor not in the list, one made for another sort among them, and a sort or a page size it does not know (R6)', async () => {
      const s = await setup('alpha');
      await fivePools(s);

      const { nextCursor } = await valuationPage(s, { limit: 2 });
      expect(nextCursor).not.toBeNull();

      for (const query of [
        { cursor: 'nope' },
        { cursor: nextCursor!, sort: '-value' },
      ]) {
        const refused = await s.agent
          .get('/v1/costs/valuation')
          .query(query)
          .expect(400);
        expect(body<{ message: string }>(refused).message).toBe(
          said('en', 'stock.cursorList'),
        );
      }

      await s.agent
        .get('/v1/costs/valuation')
        .query({ sort: 'quantity' })
        .expect(400);
      await s.agent
        .get('/v1/costs/valuation')
        .query({ limit: 101 })
        .expect(400);
    });

    /**
     * Equipment is a fixed asset, not stock value (ADR-048, amended by
     * ADR-092): received, held and valued in the ledger as any item is, but
     * left out of the total, the pools, their export and everything that
     * waits for a cost, Inventory's filter included.
     */
    it('leaves equipment out of stock value and of what waits for a cost, though Inventory holds it', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');
      const filler = await variant(s, 'FILLER', 'equipment');
      const press = await variant(s, 'PRESS', 'equipment');

      await buy(s, scoop, '10', cad('2'));
      await buy(s, filler, '1', cad('18500'));
      // Received with no price: the ledger marks it, but nothing waits on it.
      await move(s, {
        variantId: press,
        toLocationId: s.shelf,
        quantity: '1',
        reason: 'receipt',
      });

      // The ledger values equipment as it values any item.
      expect(await poolOf(db, filler)).toMatchObject({
        quantity: '1.0000',
        value: '18500.000000',
      });

      // Inventory holds it where it stands.
      const stock = body<{ entries: { sku: string; onHand: string }[] }>(
        await s.agent.get('/v1/stock/by-code').expect(200),
      ).entries;
      expect(
        stock
          .map(({ sku, onHand }) => ({ sku, quantity: onHand }))
          .sort((a, b) => a.sku.localeCompare(b.sku)),
      ).toEqual([
        { sku: 'FILLER', quantity: '1.0000' },
        { sku: 'PRESS', quantity: '1.0000' },
        { sku: 'SCOOP', quantity: '10.0000' },
      ]);

      expect(await valuationTotals(s, {})).toMatchObject({
        total: '20.000000',
        provisional: false,
        pools: 1,
        count: 1,
      });
      expect(
        (await valuationPage(s, {})).entries.map((pool) => pool.sku),
      ).toEqual(['SCOOP']);

      const exported = (
        await s.agent.get('/v1/costs/valuation/export').expect(200)
      ).text;
      // Its money at the currency's places, stored 2.000000 and 20.000000
      // (99a).
      expect(exported).toContain('SCOOP,,10,2.00,20.00,CAD,false');
      expect(exported).not.toMatch(/FILLER|PRESS/);

      expect(await needsCost(s)).toEqual([]);
      expect(
        body<{ entries: unknown[] }>(
          await s.agent.get('/v1/stock/by-code?needsCost=true').expect(200),
        ).entries,
      ).toEqual([]);
      expect(
        body<{ needsCost: number }>(
          await s.agent.get('/v1/stock/by-code/counts').expect(200),
        ),
      ).toMatchObject({ needsCost: 0 });
    });
  });

  describe('permissions', () => {
    it('keeps costs to the Owner', async () => {
      const s = await setup('alpha');

      const agent = await addMember(app, s, 'admin@alpha.example.com', 'Admin');

      await agent.get('/v1/costs/valuation').expect(403);
      await agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'USD', rateDate: '2026-09-28', rate: '1.37' })
        .expect(403);
    });
  });
});
