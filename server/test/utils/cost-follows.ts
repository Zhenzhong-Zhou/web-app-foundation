import { sql } from 'drizzle-orm';

import type { Database } from '../../src/database/database.module';

/**
 * The three checks every test of a cost that follows stock makes (ADR-094's
 * amendment, R2), after a late cost: a cost set or corrected, or a batch's
 * at its run's close (ADR-048). A part counted twice, or a share kept that
 * was not the pool's, breaks the first; a part lost or made up, the second;
 * a pool written apart from its rows, the third. Each reads one code alone,
 * so a test may give costs to several in one organization.
 */

/** A late cost, and what a test knows of it. */
export interface LateCost {
  /** The code it was given for. */
  variantId: string;
  /** What it changed the acquisition's value by, signed. */
  change: string;
  /**
   * The dearest cost any of the code's stock was given, as a value for a
   * quantity: a unit price for one, a batch's cost for its output.
   */
  most: { value: string; quantity: string };
  /** The answer's parts, where its route answers them: Set cost does. */
  answer?: { held: string; issued: string; followed: { value: string }[] };
}

/** A cost given for one unit at a unit price. */
export const each = (unitPrice: string) => ({
  value: unitPrice,
  quantity: '1',
});

/**
 * A signed decimal string in millionths, the ledger's places, so a test can
 * add amounts exactly; the server adds in Postgres (ADR-025).
 */
export function millionths(value: string): bigint {
  const [whole, fraction = ''] = value.replace('-', '').split('.');
  const units =
    BigInt(whole) * 1_000_000n + BigInt(fraction.padEnd(6, '0').slice(0, 6));
  return value.startsWith('-') ? -units : units;
}

/**
 * No lot holds more than its units at the cost given; held and issued add up
 * to the cost given; each pool's value is the sum of its ledger rows,
 * `issued` aside.
 */
export async function expectCostToFollow(
  db: Database,
  late: LateCost,
): Promise<void> {
  await expectNoLotOver(db, late);
  await expectToAddUp(db, late);
  await expectPoolsToBeTheirRows(db, late.variantId);
}

/**
 * No lot of the code holds more than its units at the dearest cost given: a
 * part counted twice would (ADR-094, D5), and so would a share kept for
 * stock gone (#677). A share rounded to the ledger's six places passes, one
 * millionth for each row of the pool, each rounded once.
 */
async function expectNoLotOver(db: Database, late: LateCost): Promise<void> {
  const pools = await db.execute<{
    lot_id: string | null;
    quantity: string;
    value: string;
    rows: number;
  }>(sql`
    select p.lot_id, p.quantity::text, p.value::text,
           (
             select count(*)::int
             from stock_valuations v
             where v.organization_id = p.organization_id
               and v.variant_id = p.variant_id
               and v.lot_id is not distinct from p.lot_id
               and v.kind <> 'issued'
           ) as rows
    from valuation_pools p
    where p.variant_id = ${late.variantId}::uuid
  `);
  const value = millionths(late.most.value);
  const quantity = millionths(late.most.quantity);
  expect(pools.rows.length).toBeGreaterThan(0);
  for (const pool of pools.rows) {
    const most =
      millionths(pool.quantity) * value + BigInt(pool.rows) * quantity;
    expect({
      lotId: pool.lot_id,
      over: millionths(pool.value) * quantity > most,
    }).toEqual({ lotId: pool.lot_id, over: false });
  }
}

/**
 * Held, issued and what followed add up to the change, in the answer where
 * there is one, and in the rows the latest late value for the code wrote in
 * its one transaction: every part carried out of one pool arrives in
 * another.
 */
async function expectToAddUp(db: Database, late: LateCost): Promise<void> {
  if (late.answer) {
    const parts = [
      late.answer.held,
      late.answer.issued,
      ...late.answer.followed.map((lot) => lot.value),
    ];
    expect(parts.reduce((sum, part) => sum + millionths(part), 0n)).toBe(
      millionths(late.change),
    );
  }

  const { rows } = await db.execute<{ total: string }>(sql`
    select coalesce(sum(v.value), 0)::text as total
    from stock_valuations v
    where v.variant_id = ${late.variantId}::uuid
      and v.kind in ('correction', 'run_close', 'issued')
      and v.created_at = (
        select max(c.created_at)
        from stock_valuations c
        where c.variant_id = ${late.variantId}::uuid
          and c.kind in ('correction', 'run_close', 'issued')
      )
  `);
  expect(millionths(rows[0].total)).toBe(millionths(late.change));
}

/**
 * Each of the code's pools holds what its rows add up to, quantity and
 * value, `issued` rows aside: they belong to stock already gone.
 */
async function expectPoolsToBeTheirRows(
  db: Database,
  variantId: string,
): Promise<void> {
  const drift = await db.execute(sql`
    select p.lot_id, p.quantity, p.value,
           v.quantity as rows_quantity, v.value as rows_value
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
    where p.variant_id = ${variantId}::uuid
      and (p.quantity <> v.quantity or p.value <> v.value)
  `);
  expect(drift.rows).toEqual([]);
}
