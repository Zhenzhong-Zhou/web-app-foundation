import { type SQL, sql } from 'drizzle-orm';

/**
 * The one rule for usable stock (ADR-085; ADR-093, R20): every figure
 * that means usable reads it, never a copy of it.
 *
 * Stock where it can be used, per item and per location marked
 * available (ADR-085): on hand in lots not expired by the organization's
 * today (ADR-072), less what released runs at that location were issued
 * and have not consumed; beside it, what was left out as expired and as
 * issued. Rows `variant_id, location_id, usable, expired, issued`, for
 * the items in `variants`, a parenthesised list or subquery of ids.
 *
 * Issued is read from the runs' lines, not the ledger: a release whose
 * source is the run's own location moves nothing, and the run still
 * consumes from it at close (ADR-032). It is taken from the stock not
 * expired, never below zero, so stock moved off a run's location is not
 * left out twice.
 *
 * Raw SQL with every table aliased, so a caller may name the outer
 * tables as it likes.
 */
export function usableByLocation(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      s.variant_id,
      s.location_id,
      greatest(0, s.unexpired - coalesce(i.quantity, 0)) as usable,
      s.expired,
      least(s.unexpired, coalesce(i.quantity, 0)) as issued
    from (
      select
        sl.variant_id,
        sl.location_id,
        coalesce(sum(sl.quantity) filter (
          where lt.expires_at < ${today}::date
        ), 0) as expired,
        coalesce(sum(sl.quantity) filter (
          where lt.expires_at is null or lt.expires_at >= ${today}::date
        ), 0) as unexpired
      from stock_levels sl
      join locations loc
        on loc.id = sl.location_id
        and loc.organization_id = ${org}
      left join lots lt
        on lt.id = sl.lot_id
        and lt.organization_id = ${org}
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        and sl.quantity > 0
        and loc.is_available
      group by sl.variant_id, sl.location_id
    ) s
    left join (
      select
        pol.component_variant_id as variant_id,
        po.location_id,
        sum(pol.quantity_planned - pol.quantity_consumed) as quantity
      from production_orders po
      join production_order_lines pol
        on pol.production_order_id = po.id
        and pol.organization_id = ${org}
      where po.organization_id = ${org}
        and po.status = 'released'
        and pol.supply_type = 'stocked'
        and pol.component_variant_id in ${variants}
      group by pol.component_variant_id, po.location_id
    ) i on i.variant_id = s.variant_id and i.location_id = s.location_id
  `;
}
