import type { INestApplication } from '@nestjs/common';
import { ThrottlerStorage } from '@nestjs/throttler';
import { and, eq, isNull, sql } from 'drizzle-orm';

import {
  type Database,
  UNSAFE_GLOBAL_DB,
} from '../src/database/database.module';
import {
  exchangeRates,
  lots,
  stockMovements,
  stockValuations,
  valuationPools,
} from '../src/database/schema';
import { MailService } from '../src/shared/mail/mail.service';
import {
  createTestApp,
  seedPermissions,
  unlimitedThrottler,
} from './utils/create-test-app';
import { RecordingMailService } from './utils/recording-mail';
import { authedAgent } from './utils/request';
import { resetDatabase } from './utils/reset-db';

interface RegisterResponse {
  user: { id: string; organizationId: string };
}

interface OrderResponse {
  id: string;
  lines: { id: string; variantId: string }[];
}

interface Price {
  unitPrice: string;
  currency: string;
}

function body<T>(res: { body: unknown }): T {
  return res.body as T;
}

const cad = (unitPrice: string): Price => ({ unitPrice, currency: 'CAD' });
const usd = (unitPrice: string): Price => ({ unitPrice, currency: 'USD' });

/**
 * Value is a ledger beside the quantity ledger (ADR-048). Values are
 * compared as strings, as quantities are: numeric(18, 6) round-trips as
 * '1900.000000', and parsing it here would be the conversion ADR-025
 * forbids.
 */
describe('Stock valuation (e2e)', () => {
  let app: INestApplication;
  let db: Database;

  const PASSWORD = 'correct-horse-battery';

  beforeAll(async () => {
    app = await createTestApp((builder) =>
      builder
        .overrideProvider(ThrottlerStorage)
        .useValue(unlimitedThrottler)
        .overrideProvider(MailService)
        .useValue(new RecordingMailService()),
    );

    db = app.get<Database>(UNSAFE_GLOBAL_DB);
    await seedPermissions(app);
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(async () => {
    await resetDatabase(app);
  });

  /**
   * The reconciliation ADR-048 promises, after every test: each pool equals
   * the sum of its valuations, in quantity and in value, and its quantity
   * equals its stock levels; and no stock sits outside a pool. Written in
   * SQL here rather than through the service, because a check that reuses
   * the code under test agrees with itself while both are wrong.
   */
  afterEach(async () => {
    const drift = await db.execute(sql`
      select p.id, p.quantity, p.value,
             v.quantity as valued_quantity, v.value as valued_value,
             l.quantity as level_quantity
      from valuation_pools p
      cross join lateral (
        select coalesce(sum(sv.quantity), 0) as quantity,
               coalesce(sum(sv.value), 0) as value
        from stock_valuations sv
        where sv.organization_id = p.organization_id
          and sv.variant_id = p.variant_id
          and sv.lot_id is not distinct from p.lot_id
      ) v
      cross join lateral (
        select coalesce(sum(sl.quantity), 0) as quantity
        from stock_levels sl
        where sl.organization_id = p.organization_id
          and sl.variant_id = p.variant_id
          and sl.lot_id is not distinct from p.lot_id
      ) l
      where p.quantity <> v.quantity
         or p.value <> v.value
         or p.quantity <> l.quantity
    `);

    expect(drift.rows).toEqual([]);

    const unpooled = await db.execute(sql`
      select sl.variant_id, sl.lot_id
      from stock_levels sl
      where not exists (
        select 1 from valuation_pools p
        where p.organization_id = sl.organization_id
          and p.variant_id = sl.variant_id
          and p.lot_id is not distinct from sl.lot_id
      )
      group by sl.variant_id, sl.lot_id
      having sum(sl.quantity) > 0
    `);

    expect(unpooled.rows).toEqual([]);
  });

  async function setup(slugish: string, base: string | null = 'CAD') {
    const agent = authedAgent(app);

    const registered = await agent
      .post('/v1/auth/register')
      .send({
        email: `owner@${slugish}.example.com`,
        password: PASSWORD,
        name: 'Owner',
        organizationName: `${slugish} Co`,
      })
      .expect(201);

    if (base) {
      await agent
        .patch('/v1/organization')
        .send({ baseCurrency: base })
        .expect(204);
    }

    const location = async (name: string) =>
      body<{ location: { id: string } }>(
        await agent
          .post('/v1/locations')
          .send({ type: 'site', name })
          .expect(201),
      ).location.id;

    const partner = async (name: string, code: string) =>
      body<{ partner: { id: string } }>(
        await agent.post('/v1/partners').send({ name, code }).expect(201),
      ).partner.id;

    return {
      agent,
      organizationId: body<RegisterResponse>(registered).user.organizationId,
      shelf: await location('Shelf'),
      bin: await location('Returns'),
      supplier: await partner('Cascade Botanicals', 'CASC'),
      customer: await partner('Northside Pharmacy', 'NORTH'),
    };
  }

  type Setup = Awaited<ReturnType<typeof setup>>;

  async function variant(s: Setup, sku: string, tracksLots = false) {
    return body<{ product: { variants: { id: string }[] } }>(
      await s.agent
        .post('/v1/products')
        .send({ type: 'material', name: sku, variant: { sku, tracksLots } })
        .expect(201),
    ).product.variants[0].id;
  }

  /** A purchase order for one item, confirmed and received in full. */
  async function buy(
    s: Setup,
    variantId: string,
    quantity: string,
    price?: Price,
    lot?: { code: string },
  ) {
    const order = body<{ order: OrderResponse }>(
      await s.agent
        .post('/v1/orders')
        .send({
          partnerId: s.supplier,
          direction: 'purchase',
          lines: [{ variantId, quantityOrdered: quantity, ...price }],
        })
        .expect(201),
    ).order;

    await s.agent
      .patch(`/v1/orders/${order.id}`)
      .send({ status: 'confirmed' })
      .expect(204);

    const res = await s.agent
      .post(`/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`)
      .send({ toLocationId: s.shelf, quantity, lot })
      .expect(201);

    return body<{ movement: { id: string } }>(res).movement.id;
  }

  /** A movement through the stock endpoint, by hand. */
  async function move(s: Setup, payload: Record<string, unknown>) {
    const res = await s.agent
      .post('/v1/stock/movements')
      .send(payload)
      .expect(201);

    return body<{ movement: { id: string } }>(res).movement.id;
  }

  /** A sale for one untracked item, confirmed and shipped from the shelf. */
  async function sellAndShip(s: Setup, variantId: string, quantity: string) {
    const order = body<{ order: OrderResponse }>(
      await s.agent
        .post('/v1/orders')
        .send({
          partnerId: s.customer,
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
          lines: [{ lineId: order.lines[0].id, quantity }],
        })
        .expect(201),
    ).shipment;

    return { order, shipmentId: shipment.id };
  }

  async function valuationOf(movementId: string) {
    const [row] = await db
      .select()
      .from(stockValuations)
      .where(eq(stockValuations.movementId, movementId));
    return row;
  }

  async function poolOf(variantId: string, lotId: string | null = null) {
    const [row] = await db
      .select()
      .from(valuationPools)
      .where(
        and(
          eq(valuationPools.variantId, variantId),
          lotId
            ? eq(valuationPools.lotId, lotId)
            : isNull(valuationPools.lotId),
        ),
      );
    return row;
  }

  async function lotIdOf(code: string) {
    const [row] = await db.select().from(lots).where(eq(lots.code, code));
    return row.id;
  }

  async function movementWith(reason: string) {
    const [row] = await db
      .select()
      .from(stockMovements)
      .where(eq(stockMovements.reason, reason));
    return row;
  }

  describe('receipts', () => {
    it('values a receipt at the price on its purchase line', async () => {
      const s = await setup('alpha');
      const blend = await variant(s, 'BLEND-FOCUS', true);

      const receipt = await buy(s, blend, '50', cad('38'), { code: 'BF-2609' });

      const row = await valuationOf(receipt);
      expect(row).toMatchObject({
        kind: 'movement',
        quantity: '50.0000',
        value: '1900.000000',
        unitPrice: '38.0000',
        currency: 'CAD',
        exchangeRate: null,
        needsCost: false,
      });

      const pool = await poolOf(blend, await lotIdOf('BF-2609'));
      expect(pool.quantity).toBe('50.0000');
      expect(pool.value).toBe('1900.000000');
    });

    it('records a receipt with no price at zero, and marks it as needing a cost', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      const byHand = await move(s, {
        variantId: scoop,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'receipt',
      });
      const unpriced = await buy(s, scoop, '5');

      for (const id of [byHand, unpriced]) {
        expect(await valuationOf(id)).toMatchObject({
          value: '0.000000',
          unitPrice: null,
          needsCost: true,
        });
      }
    });

    it('converts a foreign price at the latest rate, and waits when there is none', async () => {
      const s = await setup('alpha');
      const extract = await variant(s, 'EXTRACT');

      const early = await buy(s, extract, '100', usd('0.25'));

      // Kept as paid, so setting a rate later has something to convert.
      expect(await valuationOf(early)).toMatchObject({
        value: '0.000000',
        unitPrice: '0.2500',
        currency: 'USD',
        exchangeRate: null,
        needsCost: true,
      });

      await db.insert(exchangeRates).values([
        {
          organizationId: s.organizationId,
          currency: 'USD',
          rateDate: '2000-01-01',
          rate: '1.37',
        },
        // Dated after today, so never the rate for a receipt made now.
        {
          organizationId: s.organizationId,
          currency: 'USD',
          rateDate: '2999-01-01',
          rate: '9',
        },
      ]);

      const later = await buy(s, extract, '100', usd('0.25'));

      expect(await valuationOf(later)).toMatchObject({
        value: '34.250000',
        exchangeRate: '1.37000000',
        needsCost: false,
      });
    });

    it('values nothing until the organization has a base currency', async () => {
      const s = await setup('alpha', null);
      const scoop = await variant(s, 'SCOOP');

      const receipt = await buy(s, scoop, '10', cad('2'));

      expect(await valuationOf(receipt)).toMatchObject({
        value: '0.000000',
        unitPrice: '2.0000',
        currency: 'CAD',
        needsCost: true,
      });
    });

    it('refuses a cost sent by a client', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      await s.agent
        .post('/v1/stock/movements')
        .send({
          variantId: scoop,
          toLocationId: s.shelf,
          quantity: '5',
          reason: 'receipt',
          cost: cad('1'),
        })
        .expect(400);
    });
  });

  describe('the average', () => {
    it('averages a lot that arrives twice at different prices', async () => {
      const s = await setup('alpha');
      const blend = await variant(s, 'BLEND-FOCUS', true);

      await buy(s, blend, '10', cad('2'), { code: 'L2024-A' });
      await buy(s, blend, '10', cad('3'), { code: 'L2024-A' });

      const lotId = await lotIdOf('L2024-A');
      const pool = await poolOf(blend, lotId);
      expect(pool.quantity).toBe('20.0000');
      expect(pool.value).toBe('50.000000');

      const out = await move(s, {
        variantId: blend,
        lotId,
        fromLocationId: s.shelf,
        quantity: '5',
        reason: 'shipment',
      });

      expect((await valuationOf(out)).value).toBe('-12.500000');
    });

    it('keeps a moving average without lots, and the last unit out takes what is left', async () => {
      const s = await setup('alpha');
      const bottle = await variant(s, 'BOTTLE-60');

      await buy(s, bottle, '10', cad('1'));
      await buy(s, bottle, '20', cad('2'));

      const first = await move(s, {
        variantId: bottle,
        fromLocationId: s.shelf,
        quantity: '10',
        reason: 'shipment',
      });

      // 10 × 50 ÷ 30, rounded to six places.
      expect((await valuationOf(first)).value).toBe('-16.666667');

      const last = await move(s, {
        variantId: bottle,
        fromLocationId: s.shelf,
        quantity: '20',
        reason: 'shipment',
      });

      // What was left, exactly, rather than 20 × 1.666667.
      expect((await valuationOf(last)).value).toBe('-33.333333');

      const pool = await poolOf(bottle);
      expect(pool.quantity).toBe('0.0000');
      expect(pool.value).toBe('0.000000');
    });

    it('writes nothing for a transfer', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      await buy(s, scoop, '10', cad('2'));

      await move(s, {
        variantId: scoop,
        fromLocationId: s.shelf,
        toLocationId: s.bin,
        quantity: '4',
        reason: 'transfer',
      });

      const rows = await db
        .select()
        .from(stockValuations)
        .where(eq(stockValuations.variantId, scoop));
      expect(rows).toHaveLength(1);

      const pool = await poolOf(scoop);
      expect(pool.quantity).toBe('10.0000');
      expect(pool.value).toBe('20.000000');
    });

    it('takes found stock at its pool’s average, and a new pool at zero', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');
      const lid = await variant(s, 'LID');

      await buy(s, scoop, '10', cad('2'));

      const found = await move(s, {
        variantId: scoop,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'adjustment',
        note: 'Found behind the rack',
      });

      expect(await valuationOf(found)).toMatchObject({
        value: '10.000000',
        needsCost: false,
      });

      const opening = await move(s, {
        variantId: lid,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'adjustment',
        note: 'Opening count',
      });

      expect(await valuationOf(opening)).toMatchObject({
        value: '0.000000',
        needsCost: true,
      });
    });
  });

  describe('stock coming back', () => {
    /**
     * 10 at 2 and 10 at 3 average 2.50; 4 ship at that; 10 more arrive at
     * 4, moving the average to 80 ÷ 26. What comes back left at 2.50.
     */
    async function shippedThenRepriced(s: Setup) {
      const scoop = await variant(s, 'SCOOP');

      await buy(s, scoop, '10', cad('2'));
      await buy(s, scoop, '10', cad('3'));

      const sale = await sellAndShip(s, scoop, '4');

      const shipped = await movementWith('shipment');
      expect((await valuationOf(shipped.id)).value).toBe('-10.000000');

      await buy(s, scoop, '10', cad('4'));

      return { scoop, ...sale };
    }

    it('takes a return back at the cost it shipped at', async () => {
      const s = await setup('alpha');
      const { order } = await shippedThenRepriced(s);

      await s.agent
        .post(`/v1/orders/${order.id}/returns`)
        .send({
          toLocationId: s.bin,
          reason: 'damaged in transit',
          lines: [{ lineId: order.lines[0].id, quantity: '1' }],
        })
        .expect(201);

      const returned = await movementWith('return');
      expect((await valuationOf(returned.id)).value).toBe('2.500000');
    });

    it('reverses a voided shipment at the cost it left at', async () => {
      const s = await setup('alpha');
      const { order, shipmentId } = await shippedThenRepriced(s);

      await s.agent
        .post(`/v1/orders/${order.id}/shipments/${shipmentId}/void`)
        .send({ reason: 'Recorded before the box left' })
        .expect(204);

      const reversal = await movementWith('adjustment');
      expect((await valuationOf(reversal.id)).value).toBe('10.000000');
    });
  });

  describe('base currency', () => {
    it('sets one, refusing anything but an ISO code', async () => {
      const s = await setup('alpha', null);

      await s.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'cad' })
        .expect(400);

      await s.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'CAD' })
        .expect(204);

      const res = await s.agent.get('/v1/organization').expect(200);
      expect(
        body<{ organization: { baseCurrency: string } }>(res).organization
          .baseCurrency,
      ).toBe('CAD');
    });

    it('refuses to change once stock is valued in it', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      await buy(s, scoop, '10', cad('2'));

      await s.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'USD' })
        .expect(409);

      // Sending the same one again is not a change.
      await s.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'CAD' })
        .expect(204);
    });

    it('allows a change while nothing carries a value', async () => {
      const s = await setup('alpha');
      const scoop = await variant(s, 'SCOOP');

      await move(s, {
        variantId: scoop,
        toLocationId: s.shelf,
        quantity: '5',
        reason: 'receipt',
      });

      await s.agent
        .patch('/v1/organization')
        .send({ baseCurrency: 'USD' })
        .expect(204);
    });
  });
});
