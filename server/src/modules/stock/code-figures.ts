import { type SQL, sql } from 'drizzle-orm';

import { comingOf, openSaleLines } from './availability';
import { type ReorderStatus, statusOf } from './reorder-status';
import { expiredByItem, onHandByItem, onHandByUse } from './usable-stock';

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
 * - `held`: what confirmed sales hold of the usable, the holds' total,
 *   the least of the usable and what they still need (heldOf; ADR-045,
 *   availability.ts's holds, line by line);
 * - `free`: usable less held, never below 0;
 * - `still_needed`: what confirmed sales still want to ship, and `short`,
 *   the part of it no stock holds;
 * - `coming`: confirmed purchases still to receive and released runs'
 *   output still to come, with `coming_on`, the soonest day a purchase is
 *   expected (a run has none);
 * - `position`: Left on screen, ADR-085's position, usable plus coming
 *   less still needed;
 * - `expires_first`: the soonest expiry of the usable stock, lots not
 *   expired at places marked available; null when none expires, a lot
 *   whose expiry is not known yet never it (ADR-094, Q5a);
 * - `all_expired`: whether every unit on hand has expired, wherever it
 *   sits, a place not available too (expiredByItem; #611, review 13);
 * - `reorder_point` and `status`, out, low, enough or discontinued
 *   (reorder-status.ts), both null without a point.
 *
 * Its shape keeps a wrong guess of how many items there are cheap
 * (ADR-093, 34a): each part is one pass grouped by item, the stock at
 * each place grouped before its place is joined (usable-stock.ts), and
 * the parts are unioned and grouped once by item, never joined. A
 * planner that guesses 100 items for 1,000 then neither pairs each item
 * with every place nor reads a part again for each item (the export of
 * 1,001 points in reorder-points.e2e-spec.ts; step 13's explain at the
 * large volume). A caller that joins the rows to others reads them from
 * a materialized CTE of its own, for the same reason. Every join names
 * the organization (ADR-003, ADR-051). Quantities are numeric, for the
 * caller to cast as its answer sends them.
 */
export function codeFigures(
  organizationId: string,
  today: string,
  variants: SQL,
  /**
   * False for a reader of the status alone, a count or a status filter:
   * `expires_first` is then null and `all_expired` false, their passes
   * over the lots not read (review 39, again).
   */
  { expiresFirst = true }: { expiresFirst?: boolean } = {},
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    with figures as (
      select
        p.variant_id,
        sum(p.on_hand) as on_hand,
        sum(p.usable) as usable,
        sum(p.expired) as expired,
        sum(p.issued) as issued,
        sum(p.unavailable) as unavailable,
        sum(p.still_needed) as still_needed,
        sum(p.coming) as coming,
        min(p.coming_on) as coming_on,
        min(p.expires_first) as expires_first,
        sum(p.expired_anywhere) as expired_anywhere,
        max(p.reorder_point) as reorder_point,
        bool_or(p.has_point) as has_point,
        bool_or(p.active) as active
      from (
        select
          v.id as variant_id,
          0::numeric as on_hand,
          0::numeric as usable,
          0::numeric as expired,
          0::numeric as issued,
          0::numeric as unavailable,
          0::numeric as still_needed,
          0::numeric as coming,
          null::date as coming_on,
          null::date as expires_first,
          0::numeric as expired_anywhere,
          rp.reorder_point,
          rp.id is not null as has_point,
          v.is_active and pr.is_active as active
        from product_variants v
        join products pr
          on pr.id = v.product_id
          and pr.organization_id = ${org}
        left join reorder_points rp
          on rp.variant_id = v.id
          and rp.organization_id = ${org}
        where v.organization_id = ${org}
          and v.id in ${variants}
        union all
        select
          st.variant_id, st.on_hand, st.usable, st.expired, st.issued,
          st.unavailable, 0, 0, null, null, 0, null, null, null
        from (${onHandByUse(organizationId, today, variants)}) st
        union all
        select nd.variant_id, 0, 0, 0, 0, 0, nd.still_needed, 0, null, null, 0, null, null, null
        from (${stillNeededOf(organizationId, variants)}) nd
        union all
        select
          c.variant_id, 0, 0, 0, 0, 0, 0, c.quantity,
          c.expected_at, null, 0, null, null, null
        from (${comingOf(organizationId, variants)}) c
        ${
          expiresFirst
            ? sql`union all
        select ex.variant_id, 0, 0, 0, 0, 0, 0, 0, null, ex.expires_first, 0, null, null, null
        from (${expiresFirstOf(organizationId, today, variants)}) ex
        union all
        select ea.variant_id, 0, 0, 0, 0, 0, 0, 0, null, null, ea.expired, null, null, null
        from (${expiredByItem(organizationId, today, variants)}) ea`
            : sql``
        }
      ) p
      group by p.variant_id
      -- Only a code of this organization's items: its own row is there.
      having bool_or(p.active) is not null
    ),
    held as (
      select f.*, ${heldOf(sql`f.usable`, sql`f.still_needed`)} as held
      from figures f
    ),
    worked as (
      select
        h.*,
        h.usable + h.coming - h.still_needed as position
      from held h
    )
    select
      f.variant_id,
      f.on_hand,
      f.usable,
      f.on_hand - f.usable as not_usable,
      f.expired,
      f.issued,
      f.unavailable,
      f.held,
      ${freeOf(sql`f.usable`, sql`f.held`)} as free,
      f.still_needed,
      f.still_needed - f.held as short,
      f.coming,
      f.coming_on,
      f.position,
      f.expires_first,
      f.on_hand > 0 and f.expired_anywhere = f.on_hand as all_expired,
      f.reorder_point,
      case when f.has_point then ${statusOf({
        position: sql`f.position`,
        reorderPoint: sql`f.reorder_point`,
        active: sql`f.active`,
      })} end as status
    from worked f
  `;
}

/** The figures a list of codes sorts by besides the name (ADR-057, amended). */
export type SortedFigure = 'onHand' | 'expires';

/**
 * One of a code's figures alone, for every item in `variants`: what a list
 * sorted by it reads before it reads its page's codes in full (ADR-093,
 * 29a). Built from codeFigures' own parts, so the figure is the one the
 * row shows, never a second copy of its rule: On hand from on hand by
 * item, Expires first from the expiry. Rows `variant_id, value`, one per
 * item with any; the others have none, 0 or no expiry. Free is no sort
 * (35a).
 *
 * Narrow on purpose: a list that keeps every code gives the planner no
 * good guess of how many there are, and it then joins the full figures'
 * parts row by row, thirteen times the cost of reading them (step 13's
 * explain). Each form here is one pass grouped by item, so no guess
 * makes it work one item at a time.
 */
export function sortedFigure(
  organizationId: string,
  today: string,
  variants: SQL,
  figure: SortedFigure,
  /** At one place alone, what is there (ADR-093, 20a). */
  locationId?: string,
): SQL {
  if (figure === 'onHand') {
    return sql`
      select oh.variant_id, oh.on_hand as value
      from (${onHandByItem(organizationId, variants, locationId)}) oh
    `;
  }
  return sql`
    select ex.variant_id, ex.expires_first as value
    from (${expiresFirstOf(organizationId, today, variants, locationId)}) ex
  `;
}

/** Free, the one rule: usable less held, never below 0 (ADR-045, amended). */
function freeOf(usable: SQL, held: SQL): SQL {
  return sql`greatest(0, ${usable} - ${held})`;
}

/**
 * Held, a code's total: what confirmed sales hold of its usable stock,
 * the least of the usable and what they still need (ADR-045, amended by
 * ADR-093, 34a). The holds share the usable out line by line, the
 * earliest confirmed first, each line taking what is left up to its
 * need (availability.ts's holdsSql), so their sum is this whenever every
 * line needs more than nothing, as every open line does;
 * code-figures.e2e-spec.ts holds the two equal on every code it walks.
 * An order's own lines, and the guard on a shipment, read the holds.
 */
function heldOf(usable: SQL, stillNeeded: SQL): SQL {
  return sql`least(${usable}, ${stillNeeded})`;
}

/**
 * What confirmed sales still want to ship per item, the holds' demand
 * summed (availability.ts's openSaleLines): rows `variant_id,
 * still_needed`.
 */
function stillNeededOf(organizationId: string, variants: SQL): SQL {
  return sql`
    select ln.variant_id, sum(ln.outstanding) as still_needed
    from (${openSaleLines(organizationId, variants)}) ln
    group by ln.variant_id
  `;
}

/**
 * The soonest expiry of the usable stock per item, lots not expired at
 * places marked available: rows `variant_id, expires_first`. Only a lot
 * with a day: one whose expiry is not known yet has none, so it is never
 * what expires first (ADR-094, Q5a).
 */
export function expiresFirstOf(
  organizationId: string,
  today: string,
  variants: SQL,
  /** At one place alone, Stock's place chosen (ADR-093, 20a). */
  locationId?: string,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select ep.variant_id, min(ep.expires_first) as expires_first
    from (
      select sl.variant_id, sl.location_id, min(lt.expires_at) as expires_first
      from stock_levels sl
      join lots lt
        on lt.id = sl.lot_id
        and lt.organization_id = ${org}
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        ${locationId ? sql`and sl.location_id = ${locationId}::uuid` : sql``}
        and sl.quantity > 0
        and lt.expires_at >= ${today}::date
      group by sl.variant_id, sl.location_id
    ) ep
    join locations loc
      on loc.id = ep.location_id
      and loc.organization_id = ${org}
      and loc.is_available
    group by ep.variant_id
  `;
}

/** A quantity as the API sends it: four places, a string (ADR-025). */
export function quantity(column: SQL): SQL {
  return sql`(${column})::numeric(18, 4)::text`;
}

/**
 * A code's figures as the API sends them, selected from `codeFigures`
 * joined as `f`: the one projection Stock's rows and Where it stands read
 * (review 32), their own columns beside it.
 */
export function figureColumns(): SQL {
  return sql`
    ${quantity(sql`f.on_hand`)} as on_hand,
    ${quantity(sql`f.usable`)} as usable,
    ${quantity(sql`f.not_usable`)} as not_usable,
    ${quantity(sql`f.expired`)} as expired,
    ${quantity(sql`f.issued`)} as issued,
    ${quantity(sql`f.unavailable`)} as unavailable,
    ${quantity(sql`f.held`)} as held,
    ${quantity(sql`f.free`)} as free,
    ${quantity(sql`f.still_needed`)} as still_needed,
    ${quantity(sql`f.short`)} as short,
    ${quantity(sql`f.coming`)} as coming,
    f.coming_on::text as coming_on,
    ${quantity(sql`f.position`)} as position,
    f.expires_first::text as expires_first,
    f.all_expired,
    ${quantity(sql`f.reorder_point`)} as reorder_point,
    f.status
  `;
}

/** What figureColumns selects, as a statement reads it. */
export type FigureRow = {
  on_hand: string;
  usable: string;
  not_usable: string;
  expired: string;
  issued: string;
  unavailable: string;
  held: string;
  free: string;
  still_needed: string;
  short: string;
  coming: string;
  coming_on: string | null;
  position: string;
  expires_first: string | null;
  all_expired: boolean;
  reorder_point: string | null;
  status: ReorderStatus | null;
};

/** A code's figures as a response holds them, still needed aside. */
export function figuresOf(row: FigureRow) {
  return {
    onHand: row.on_hand,
    usable: row.usable,
    notUsable: row.not_usable,
    expired: row.expired,
    issued: row.issued,
    unavailable: row.unavailable,
    held: row.held,
    free: row.free,
    short: row.short,
    coming: row.coming,
    comingOn: row.coming_on,
    position: row.position,
    expiresFirst: row.expires_first,
    allExpired: row.all_expired,
    reorderPoint: row.reorder_point,
    status: row.status,
  };
}
