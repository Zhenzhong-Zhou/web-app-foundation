import { type SQL, sql } from 'drizzle-orm';

import type { ProductType } from '../../database/schema';

/**
 * Whether a variant's value is stock value (ADR-048, amended by ADR-092):
 * every item's but equipment's. Equipment is a fixed asset, not stock
 * held to sell or use up, so it is received, moved and counted where it
 * stands, and its movements are valued in the ledger, but stock value and
 * what waits for a cost leave it out.
 *
 * A condition on `variantId`, the outer row's variant; the subquery names
 * the organization in its own join and filter (ADR-003).
 */
export function inStockValue(organizationId: string, variantId: SQL): SQL {
  return sql`not exists (
    select 1
    from product_variants ev
    join products ep
      on ep.id = ev.product_id
     and ep.organization_id = ${organizationId}::uuid
    where ev.id = ${variantId}
      and ev.organization_id = ${organizationId}::uuid
      and ep.type = ${'equipment' satisfies ProductType}
  )`;
}

/**
 * Needs-cost rows still standing (ADR-048).
 *
 * The flag is never edited; a row is cleared by a later one. A correction
 * that references it clears any acquisition, and a run_close for its run
 * clears a batch's output. Everything that marks a figure provisional reads
 * through this, so there is one definition of "still waiting": the stock
 * list's "Needs a cost" quick filter (ADR-055) included, which has to mean
 * exactly what Stock value lists as waiting, and Home's count of them
 * (ADR-091). Equipment's rows are not waiting: it is not stock value
 * (inStockValue).
 *
 * Each join and subquery names the organization itself (ADR-003), not
 * the outer row's: read
 * as a set, Postgres hashes the run_close lookup once, and through the
 * outer row's column it read every organization's run closes to do so
 * (#276).
 */
export function openNeedsCost(organizationId: string): SQL {
  return sql`
    select v.id, v.variant_id, v.lot_id, v.created_at
    from stock_valuations v
    left join stock_movements m
      on m.id = v.movement_id and m.organization_id = ${organizationId}::uuid
    where v.organization_id = ${organizationId}::uuid
      and v.needs_cost
      and ${inStockValue(organizationId, sql`v.variant_id`)}
      and not exists (
        select 1
        from stock_valuations c
        where c.organization_id = ${organizationId}::uuid
          and c.kind = 'correction'
          and c.reference_type = 'stock_valuation'
          and c.reference_id = v.id
      )
      and (
        coalesce(m.reason, '') <> 'production'
        or not exists (
          select 1
          from stock_valuations r
          where r.organization_id = ${organizationId}::uuid
            and r.kind = 'run_close'
            and r.reference_type = 'production_order'
            and r.reference_id = m.reference_id
        )
      )
  `;
}
