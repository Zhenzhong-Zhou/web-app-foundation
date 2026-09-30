import type { INestApplication } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import { roles, stockMovements, stockValuations } from '../src/database/schema';
import {
  body,
  createE2eApp,
  createLocation,
  createPartner,
  createVariant,
  PASSWORD,
  registerOrganization,
} from './utils/fixtures';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';
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
    type: 'good' | 'material' | 'packaging' = 'material',
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

      const res = await s.agent.get('/v1/costs/valuation').expect(200);
      const valuation = body<{
        valuation: {
          currency: string;
          total: string;
          provisional: boolean;
          pools: { sku: string; value: string; provisional: boolean }[];
        };
      }>(res).valuation;

      expect(valuation).toMatchObject({
        currency: 'CAD',
        total: '20.000000',
        provisional: true,
      });
      expect(valuation.pools).toMatchObject([
        { sku: 'LID', value: '0.000000', provisional: true },
        { sku: 'SCOOP', value: '20.000000', provisional: false },
      ]);
    });
  });

  describe('permissions', () => {
    it('keeps costs to the Owner', async () => {
      const s = await setup('alpha');

      const [admin] = await db
        .select({ id: roles.id })
        .from(roles)
        .where(
          and(
            eq(roles.organizationId, s.organizationId),
            eq(roles.name, 'Admin'),
          ),
        );

      await s.agent
        .post('/v1/users')
        .send({
          email: 'admin@alpha.example.com',
          name: 'Admin',
          password: PASSWORD,
          roleId: admin.id,
        })
        .expect(201);

      const agent = authedAgent(app);
      await agent
        .post('/v1/auth/login')
        .send({ email: 'admin@alpha.example.com', password: PASSWORD })
        .expect(200);

      await agent.get('/v1/costs/valuation').expect(403);
      await agent
        .put('/v1/costs/exchange-rates')
        .send({ currency: 'USD', rateDate: '2026-09-28', rate: '1.37' })
        .expect(403);
    });
  });
});
