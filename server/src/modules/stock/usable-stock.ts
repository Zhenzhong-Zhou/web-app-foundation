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

/**
 * Usable stock per item, the one rule above summed over the locations
 * marked available: what holds draw on (ADR-045, amended by ADR-093),
 * and what Reorder's position counts (ADR-085). Rows `variant_id,
 * usable`, for the items in `variants`.
 */
export function usableByItem(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  return sql`
    select u.variant_id, sum(u.usable) as usable
    from (${usableByLocation(organizationId, today, variants)}) u
    group by u.variant_id
  `;
}

/**
 * On hand per item at every place, split by the one rule (ADR-093, R1):
 * usable, and the not usable by why, expired or issued to a run at a
 * place marked available, or at a place not available (ADR-042). The
 * four add up to on hand. Rows `variant_id, on_hand, usable, expired,
 * issued, unavailable`, for the items in `variants` with stock anywhere.
 */
export function onHandByUse(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      h.variant_id,
      h.on_hand,
      coalesce(u.usable, 0) as usable,
      coalesce(u.expired, 0) as expired,
      coalesce(u.issued, 0) as issued,
      h.unavailable
    from (
      select
        sl.variant_id,
        sum(sl.quantity) as on_hand,
        coalesce(sum(sl.quantity) filter (where not loc.is_available), 0)
          as unavailable
      from stock_levels sl
      join locations loc
        on loc.id = sl.location_id
        and loc.organization_id = ${org}
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        and sl.quantity > 0
      group by sl.variant_id
    ) h
    left join (
      select
        a.variant_id,
        sum(a.usable) as usable,
        sum(a.expired) as expired,
        sum(a.issued) as issued
      from (${usableByLocation(organizationId, today, variants)}) a
      group by a.variant_id
    ) u on u.variant_id = h.variant_id
  `;
}
