import { type SQL, sql } from 'drizzle-orm';

import { holdsSql } from './availability';
import { statusOf } from './reorder-status';
import { onHandByItem, onHandByUse, usableByItem } from './usable-stock';

/**
 * The one read for a code's figures (ADR-093, R1 and R20): Inventory's
 * row, Where it stands and Reorder's row read it, so no screen adds up
 * its own. Rows, one per item in `variants`, a parenthesised list or
 * subquery of ids, of this organization's:
 *
 * - `on_hand`: every unit at every place, usable or not;
 * - `usable`, and `not_usable` beside it by why, `expired`, `issued` and
 *   `unavailable`, the one rule for usable stock (usable-stock.ts); the
 *   three add up to `not_usable`, and it and `usable` to `on_hand`;
 * - `held`: what confirmed sales hold of the usable, the earliest
 *   confirmed first (ADR-045, availability.ts's holds);
 * - `free`: usable less held, never below 0;
 * - `still_needed`: what confirmed sales still want to ship, and `short`,
 *   the part of it no stock holds;
 * - `coming`: confirmed purchases still to receive and released runs'
 *   output still to come, with `coming_on`, the soonest day a purchase is
 *   expected (a run has none);
 * - `position`: Left on screen, ADR-085's position, usable plus coming
 *   less still needed;
 * - `expires_first`: the soonest expiry of the usable stock, lots not
 *   expired at places marked available; null when none expires;
 * - `reorder_point` and `status`, out, low, enough or discontinued
 *   (reorder-status.ts), both null without a point.
 *
 * Usable stock is read once, for on hand and for the holds alike, and
 * each sum once for all the items, materialized, so a planner that
 * misjudges how many items there are cannot work them out again for each
 * (the export of 1,001 points in reorder-points.e2e-spec.ts). A caller
 * that joins the rows to others reads them from a materialized CTE of
 * its own, for the same reason. Every join names the organization
 * (ADR-003, ADR-051). Quantities are numeric, for the caller to cast as
 * its answer sends them.
 */
export function codeFigures(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    with stock as materialized (${onHandByUse(organizationId, today, variants)}),
    holds as materialized (${heldOf(
      organizationId,
      today,
      variants,
      sql`select st.variant_id, st.usable from stock st`,
    )}),
    coming as materialized (
      select
        cm.variant_id,
        sum(cm.quantity) as quantity,
        min(cm.expected_at) as first_expected
      from (
        select
          ol.variant_id,
          ol.quantity_ordered - ol.quantity_fulfilled as quantity,
          o.expected_at
        from order_lines ol
        join orders o
          on o.id = ol.order_id
          and o.organization_id = ${org}
        where ol.organization_id = ${org}
          and ol.variant_id in ${variants}
          and o.direction = 'purchase'
          and o.status = 'confirmed'
          -- order_lines_open_idx's own predicate, as the holds read it.
          and not ol.is_closed_short
          and ol.quantity_ordered > ol.quantity_fulfilled
        union all
        select
          po.output_variant_id,
          greatest(0, po.quantity_planned - po.quantity_produced),
          null::date
        from production_orders po
        where po.organization_id = ${org}
          and po.status = 'released'
          and po.output_variant_id in ${variants}
      ) cm
      group by cm.variant_id
    ),
    expiry as materialized (${expiresFirstOf(organizationId, today, variants)}),
    figures as (
      select
        v.id as variant_id,
        coalesce(s.on_hand, 0) as on_hand,
        coalesce(s.usable, 0) as usable,
        coalesce(s.on_hand, 0) - coalesce(s.usable, 0) as not_usable,
        coalesce(s.expired, 0) as expired,
        coalesce(s.issued, 0) as issued,
        coalesce(s.unavailable, 0) as unavailable,
        coalesce(h.held, 0) as held,
        ${freeOf(sql`coalesce(s.usable, 0)`, sql`coalesce(h.held, 0)`)} as free,
        coalesce(h.still_needed, 0) as still_needed,
        coalesce(h.still_needed, 0) - coalesce(h.held, 0) as short,
        coalesce(c.quantity, 0) as coming,
        c.first_expected as coming_on,
        coalesce(s.usable, 0) + coalesce(c.quantity, 0)
          - coalesce(h.still_needed, 0) as position,
        e.expires_first,
        rp.reorder_point,
        rp.id is not null as has_point,
        v.is_active and pr.is_active as active
      from product_variants v
      join products pr
        on pr.id = v.product_id
        and pr.organization_id = ${org}
      left join stock s on s.variant_id = v.id
      left join holds h on h.variant_id = v.id
      left join coming c on c.variant_id = v.id
      left join expiry e on e.variant_id = v.id
      left join reorder_points rp
        on rp.variant_id = v.id
        and rp.organization_id = ${org}
      where v.organization_id = ${org}
        and v.id in ${variants}
    )
    select
      f.variant_id,
      f.on_hand,
      f.usable,
      f.not_usable,
      f.expired,
      f.issued,
      f.unavailable,
      f.held,
      f.free,
      f.still_needed,
      f.short,
      f.coming,
      f.coming_on,
      f.position,
      f.expires_first,
      f.reorder_point,
      case when f.has_point then ${statusOf({
        position: sql`f.position`,
        reorderPoint: sql`f.reorder_point`,
        rule: sql`null`,
        fixedQuantity: sql`null`,
        maximumQuantity: sql`null`,
        inDraft: sql`0`,
        active: sql`f.active`,
      })} end as status
    from figures f
  `;
}

/** The figures a list of codes sorts by besides the name (ADR-057, amended). */
export type SortedFigure = 'onHand' | 'free' | 'expires';

/**
 * One of a code's figures alone, for every item in `variants`: what a list
 * sorted by it reads before it reads its page's codes in full (ADR-093,
 * 29a). Built from codeFigures' own parts, so the figure is the one the
 * row shows, never a second copy of its rule: On hand from on hand by
 * item, Free from the usable and the holds, Expires first from the
 * expiry. Rows `variant_id, value`, one per item with any; the others
 * have none, 0 or no expiry.
 *
 * Narrow on purpose: a list that keeps every code gives the planner no
 * good guess of how many there are, and it then joins the full figures'
 * parts row by row, thirteen times the cost of reading them (step 13's
 * explain). Each form here is one pass grouped by item, Free its two
 * sums unioned rather than joined, so no guess makes it work one item
 * at a time.
 */
export function sortedFigure(
  organizationId: string,
  today: string,
  variants: SQL,
  figure: SortedFigure,
): SQL {
  if (figure === 'onHand') {
    return sql`
      select oh.variant_id, oh.on_hand as value
      from (${onHandByItem(organizationId, variants)}) oh
    `;
  }
  if (figure === 'expires') {
    return sql`
      select ex.variant_id, ex.expires_first as value
      from (${expiresFirstOf(organizationId, today, variants)}) ex
    `;
  }
  return sql`
    with usable as materialized (${usableByItem(organizationId, today, variants)}),
    holds as materialized (${heldOf(
      organizationId,
      today,
      variants,
      sql`select us.variant_id, us.usable from usable us`,
    )})
    select
      fr.variant_id,
      ${freeOf(sql`sum(fr.usable)`, sql`sum(fr.held)`)} as value
    from (
      select us.variant_id, us.usable, 0 as held from usable us
      union all
      select hd.variant_id, 0, hd.held from holds hd
    ) fr
    group by fr.variant_id
  `;
}

/** Free, the one rule: usable less held, never below 0 (ADR-045, amended). */
function freeOf(usable: SQL, held: SQL): SQL {
  return sql`greatest(0, ${usable} - ${held})`;
}

/**
 * What confirmed sales hold of the `supply`, rows `variant_id, usable`,
 * and what they still need, per item: rows `variant_id, held,
 * still_needed` (availability.ts's holds).
 */
function heldOf(
  organizationId: string,
  today: string,
  variants: SQL,
  supply: SQL,
): SQL {
  return sql`
    select
      hl.variant_id,
      sum(hl.held) as held,
      sum(hl.outstanding) as still_needed
    from (${holdsSql(organizationId, today, variants, supply)}) hl
    group by hl.variant_id
  `;
}

/**
 * The soonest expiry of the usable stock per item, lots not expired at
 * places marked available: rows `variant_id, expires_first`.
 */
function expiresFirstOf(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select sl.variant_id, min(lt.expires_at) as expires_first
    from stock_levels sl
    join locations loc
      on loc.id = sl.location_id
      and loc.organization_id = ${org}
    join lots lt
      on lt.id = sl.lot_id
      and lt.organization_id = ${org}
    where sl.organization_id = ${org}
      and sl.variant_id in ${variants}
      and sl.quantity > 0
      and loc.is_available
      and lt.expires_at >= ${today}::date
    group by sl.variant_id
  `;
}
