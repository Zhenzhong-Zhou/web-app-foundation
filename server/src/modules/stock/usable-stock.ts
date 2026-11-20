import { type SQL, sql } from 'drizzle-orm';

/**
 * The rule's two tests, each written once: a lot not expired by the
 * organization's today (ADR-072), one with no expiry never, on the lot
 * aliased `lt`; and a place marked available (ADR-085), aliased `loc`.
 */
const notExpired = (today: string) =>
  sql`(lt.expires_at is null or lt.expires_at >= ${today}::date)`;
const AVAILABLE = sql`loc.is_available`;

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
 * The stock is summed per item and place before its place is joined,
 * here and in onHandByItem (ADR-093, 34a): joined first, a planner that
 * guesses too few items pairs each with every place and looks each pair
 * up, 125,000 lookups for 1,000 items at the large volume.
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
          where not ${notExpired(today)}
        ), 0) as expired,
        coalesce(sum(sl.quantity) filter (
          where ${notExpired(today)}
        ), 0) as unexpired
      from stock_levels sl
      left join lots lt
        on lt.id = sl.lot_id
        and lt.organization_id = ${org}
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        and sl.quantity > 0
      group by sl.variant_id, sl.location_id
    ) s
    join locations loc
      on loc.id = s.location_id
      and loc.organization_id = ${org}
      and ${AVAILABLE}
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
 * One lot at each place it has a row, by the one rule above, for its
 * trace (ADR-044; ADR-093, 10a; review 27): `usable` its quantity at a
 * place marked available while the lot has not expired by the
 * organization's today, null where not, and `not_usable` the rest. What
 * released runs were issued is counted by item and place, never by lot,
 * so it is not taken here as usableByLocation takes it. Rows
 * `location_id, location_name, location_code, is_available, quantity,
 * usable, not_usable`, a place emptied included at 0.
 */
export function usableInLot(
  organizationId: string,
  today: string,
  lotId: string,
): SQL {
  const org = sql`${organizationId}::uuid`;
  const usable = sql`${AVAILABLE} and ${notExpired(today)}`;

  return sql`
    select
      sl.location_id,
      loc.name as location_name,
      loc.code as location_code,
      loc.is_available,
      sl.quantity,
      case when ${usable} then sl.quantity end as usable,
      case when ${usable} then null else sl.quantity end as not_usable
    from stock_levels sl
    join lots lt
      on lt.id = sl.lot_id
      and lt.organization_id = ${org}
    join locations loc
      on loc.id = sl.location_id
      and loc.organization_id = ${org}
    where sl.organization_id = ${org}
      and sl.lot_id = ${lotId}::uuid
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
 * issued, unavailable`, for the items in `variants` with stock anywhere;
 * its two halves unioned and grouped by item, never joined, as
 * codeFigures' parts are.
 */
export function onHandByUse(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  return sql`
    select
      h.variant_id,
      sum(h.on_hand) as on_hand,
      sum(h.usable) as usable,
      sum(h.expired) as expired,
      sum(h.issued) as issued,
      sum(h.unavailable) as unavailable
    from (
      select
        oh.variant_id,
        oh.on_hand,
        0::numeric as usable,
        0::numeric as expired,
        0::numeric as issued,
        oh.unavailable
      from (${onHandByItem(organizationId, variants)}) oh
      union all
      select a.variant_id, 0, a.usable, a.expired, a.issued, 0
      from (${usableByLocation(organizationId, today, variants)}) a
    ) h
    group by h.variant_id
  `;
}

/**
 * On hand per item at every place, usable or not, and the part of it at
 * places not available (ADR-042): onHandByUse's first half, and alone
 * what a list sorted by On hand reads (ADR-093, 29a) and what Movements'
 * balance is worked back from (41a). Rows `variant_id, on_hand,
 * unavailable`, for the items in `variants` with stock anywhere.
 */
export function onHandByItem(
  organizationId: string,
  /** Those items alone; none, every item of the organization's. */
  variants?: SQL,
  /** At one place alone, Stock's place chosen (ADR-093, 20a). */
  locationId?: string,
  /** In one lot alone, Movements' lot chosen (ADR-093, 85a). */
  lotId?: string,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      s.variant_id,
      sum(s.quantity) as on_hand,
      coalesce(sum(s.quantity) filter (where not loc.is_available), 0)
        as unavailable
    from (
      select sl.variant_id, sl.location_id, sum(sl.quantity) as quantity
      from stock_levels sl
      where sl.organization_id = ${org}
        ${variants ? sql`and sl.variant_id in ${variants}` : sql``}
        ${locationId ? sql`and sl.location_id = ${locationId}::uuid` : sql``}
        ${lotId ? sql`and sl.lot_id = ${lotId}::uuid` : sql``}
        and sl.quantity > 0
      group by sl.variant_id, sl.location_id
    ) s
    join locations loc
      on loc.id = s.location_id
      and loc.organization_id = ${org}
    group by s.variant_id
  `;
}
