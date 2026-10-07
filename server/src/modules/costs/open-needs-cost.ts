import { type SQL, sql } from 'drizzle-orm';

/**
 * Needs-cost rows still standing (ADR-048).
 *
 * The flag is never edited; a row is cleared by a later one. A correction
 * that references it clears any acquisition, and a run_close for its run
 * clears a batch's output. Everything that marks a figure provisional reads
 * through this, so there is one definition of "still waiting": the stock
 * list's "Needs a cost" quick filter (ADR-055) included, which has to mean
 * exactly what Stock value lists as waiting.
 */
export function openNeedsCost(organizationId: string): SQL {
  return sql`
    select v.id, v.variant_id, v.lot_id, v.created_at
    from stock_valuations v
    left join stock_movements m on m.id = v.movement_id
    where v.organization_id = ${organizationId}::uuid
      and v.needs_cost
      and not exists (
        select 1
        from stock_valuations c
        where c.organization_id = v.organization_id
          and c.kind = 'correction'
          and c.reference_type = 'stock_valuation'
          and c.reference_id = v.id
      )
      and (
        coalesce(m.reason, '') <> 'production'
        or not exists (
          select 1
          from stock_valuations r
          where r.organization_id = v.organization_id
            and r.kind = 'run_close'
            and r.reference_type = 'production_order'
            and r.reference_id = m.reference_id
        )
      )
  `;
}
