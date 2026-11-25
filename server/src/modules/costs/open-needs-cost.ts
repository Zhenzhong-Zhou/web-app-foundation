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
 * A lot change's row in that waited takes no cost of its own: the cost
 * that its first lot waited for follows it when given (ADR-094, D5;
 * revaluation.ts). So it waits while anything that waited in the first
 * lot before the move still does, and not after, which the recursion
 * reads: a row the first lot took in from a third lot waits the same way,
 * and each step is a later row, so it ends.
 *
 * Plain rows, every kind but a lot change, are read directly, `pending`,
 * through the partial index on the flag, and the recursion starts only
 * from a lot change's row in whose first lot a plain row from before the
 * move still waits (ADR-094's amendment, R4; #664). It walks the few lot
 * changes, never the many plain rows, which before were each its first
 * step and went through its union's de-duplication. The two halves are of
 * different kinds, so they add up with nothing counted twice. MATERIALIZED
 * keeps `pending` planned on its own, its movements looked up by key in
 * parallel: folded into the rest, Postgres hashed every movement of the
 * organization instead, 420,000 at ADR-051's large scale and 200 ms.
 *
 * Each join and subquery names the organization itself (ADR-003), not the
 * outer row's: read as a set, Postgres hashes the run_close lookup once,
 * and through the outer row's column it read every organization's run
 * closes to do so (#276).
 */
export function openNeedsCost(
  organizationId: string,
  /** Those items alone, a page's (review 40); none, every item. */
  variants?: SQL,
): SQL {
  const chosen = sql`
    ${variants ? sql`and v.variant_id in ${variants}` : sql``}
    and ${inStockValue(organizationId, sql`v.variant_id`)}`;

  return sql`
    with recursive pending as materialized (
      select v.id, v.variant_id, v.lot_id, v.created_at,
             m.reason, m.reference_id
      from stock_valuations v
      left join stock_movements m
        on m.id = v.movement_id and m.organization_id = ${organizationId}::uuid
      where v.organization_id = ${organizationId}::uuid
        and v.needs_cost
        and v.kind <> 'lot_change'
        ${chosen}
    ),
    plain as (
      select p.id, p.variant_id, p.lot_id, p.created_at
      from pending p
      where ${stillWaits(organizationId, sql`p.id`, sql`p.reason`, sql`p.reference_id`)}
    ),
    changes as (
      select v.id, v.variant_id, v.lot_id, v.created_at,
             m.lot_id as from_lot_id
      from stock_valuations v
      left join stock_movements m
        on m.id = v.movement_id and m.organization_id = ${organizationId}::uuid
      where v.organization_id = ${organizationId}::uuid
        and v.needs_cost
        and v.kind = 'lot_change'
        ${chosen}
    ),
    moved (id, variant_id, lot_id, created_at) as (
      select d.id, d.variant_id, d.lot_id, d.created_at
      from changes d
      where exists (
        select 1
        from stock_valuations p
        left join stock_movements pm
          on pm.id = p.movement_id
         and pm.organization_id = ${organizationId}::uuid
        where p.organization_id = ${organizationId}::uuid
          and p.needs_cost
          and p.variant_id = d.variant_id
          and p.lot_id is not distinct from d.from_lot_id
          and p.id < d.id
          and p.kind <> 'lot_change'
          and ${stillWaits(organizationId, sql`p.id`, sql`pm.reason`, sql`pm.reference_id`)}
      )
      union
      select d.id, d.variant_id, d.lot_id, d.created_at
      from changes d
      join moved w
        on w.variant_id = d.variant_id
       and w.lot_id is not distinct from d.from_lot_id
       and w.id < d.id
    )
    select id, variant_id, lot_id, created_at from plain
    union all
    select id, variant_id, lot_id, created_at from moved
  `;
}

/**
 * Whether a plain row that waited still does: no correction has given it
 * a cost, and, for a batch's output, its run has not closed. `id` is the
 * value row's; `reason` and `referenceId` its movement's, left-joined.
 */
function stillWaits(
  organizationId: string,
  id: SQL,
  reason: SQL,
  referenceId: SQL,
): SQL {
  return sql`not exists (
      select 1
      from stock_valuations c
      where c.organization_id = ${organizationId}::uuid
        and c.kind = 'correction'
        and c.reference_type = 'stock_valuation'
        and c.reference_id = ${id}
    )
    and (
      coalesce(${reason}, '') <> 'production'
      or not exists (
        select 1
        from stock_valuations r
        where r.organization_id = ${organizationId}::uuid
          and r.kind = 'run_close'
          and r.reference_type = 'production_order'
          and r.reference_id = ${referenceId}
      )
    )`;
}
