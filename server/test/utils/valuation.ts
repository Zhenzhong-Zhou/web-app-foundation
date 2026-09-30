import { and, eq, isNull, sql } from 'drizzle-orm';
import type TestAgent from 'supertest/lib/agent';

import type { Database } from '../../src/database/database.module';
import {
  lots,
  stockValuations,
  valuationPools,
} from '../../src/database/schema';
import { body } from './fixtures';

/**
 * For the specs about value (ADR-048): costs and valuation. Both buy stock,
 * move it, and read the valuation and pool rows the ledger wrote; both check
 * after every test that the two ledgers still agree.
 */

export interface Price {
  unitPrice: string;
  currency: string;
}

export const cad = (unitPrice: string): Price => ({
  unitPrice,
  currency: 'CAD',
});
export const usd = (unitPrice: string): Price => ({
  unitPrice,
  currency: 'USD',
});

/** What buying needs from a spec's setup: who buys, from whom, onto which shelf. */
export interface Stocked {
  agent: TestAgent;
  supplier: string;
  shelf: string;
}

interface OrderResponse {
  id: string;
  lines: { id: string; variantId: string }[];
}

/**
 * The invariant the valuation tables exist to keep: every pool equals the
 * value rows behind it and the stock it prices, and no stock sits outside a
 * pool. Asserted after every test rather than in any one, because every test
 * that moves stock is a chance to break it.
 */
export async function expectBooksToReconcile(db: Database): Promise<void> {
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
        and sv.kind <> 'issued'
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
}

/** A purchase order for one item, confirmed and received in full. */
export async function buy(
  s: Stocked,
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
export async function move(s: Stocked, payload: Record<string, unknown>) {
  const res = await s.agent
    .post('/v1/stock/movements')
    .send(payload)
    .expect(201);

  return body<{ movement: { id: string } }>(res).movement.id;
}

export async function valuationOf(db: Database, movementId: string) {
  const [row] = await db
    .select()
    .from(stockValuations)
    .where(eq(stockValuations.movementId, movementId));
  return row;
}

export async function poolOf(
  db: Database,
  variantId: string,
  lotId: string | null = null,
) {
  const [row] = await db
    .select()
    .from(valuationPools)
    .where(
      and(
        eq(valuationPools.variantId, variantId),
        lotId ? eq(valuationPools.lotId, lotId) : isNull(valuationPools.lotId),
      ),
    );
  return row;
}

export async function lotIdOf(db: Database, code: string) {
  const [row] = await db.select().from(lots).where(eq(lots.code, code));
  return row.id;
}
