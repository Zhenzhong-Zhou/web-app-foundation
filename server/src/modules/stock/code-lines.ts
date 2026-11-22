import { type SQL, sql } from 'drizzle-orm';

import { comingOf } from './availability';
import { holdsSql } from './availability';
import { usableByLocation } from './usable-stock';

/**
 * What is behind a code's figures, line by line (ADR-093, R8): the
 * documents its Coming and Held count, and its usable stock by lot, each
 * read by the rule its figure is (code-figures.ts), so the lines add up
 * to the figures. For the items in `variants`, a parenthesised list or
 * subquery of ids. Raw SQL with every table aliased; quantities numeric,
 * for the caller to cast as its answer sends them. Every join names the
 * organization (ADR-003, ADR-051).
 */

/**
 * Coming, line by line: each confirmed purchase's line still to receive,
 * with its supplier, its expected day, and late once that day has
 * passed; and each released run's output still to come, with its
 * maker, if another makes it, and no day. Rows `variant_id, kind, id,
 * number, partner_name, quantity, expected_at, late`.
 */
export function comingLinesOf(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  // The figure's own lines (comingOf), each with its supplier or maker.
  return sql`
    select
      c.variant_id,
      c.kind,
      c.id,
      c.number,
      pa.name as partner_name,
      c.quantity,
      c.expected_at,
      coalesce(c.expected_at < ${today}::date, false) as late
    from (${comingOf(organizationId, variants)}) c
    left join partners pa
      on pa.id = c.partner_id
      and pa.organization_id = ${org}
  `;
}

/**
 * Held, order by order: each confirmed sale still wanting the item, with
 * its customer and its expected day, what it wants and what it holds,
 * from the holds a code's figures add up (availability.ts's holdsSql).
 * Rows `variant_id, order_id, number, partner_name, expected_at,
 * confirmed_at, wanted, held`, the earliest confirmed holding first, as
 * ADR-045 orders them.
 */
export function holdLinesOf(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      h.variant_id,
      h.order_id,
      o.number,
      pa.name as partner_name,
      o.expected_at,
      o.confirmed_at,
      sum(h.outstanding) as wanted,
      sum(h.held) as held
    from (${holdsSql(organizationId, today, variants)}) h
    join orders o
      on o.id = h.order_id
      and o.organization_id = ${org}
    join partners pa
      on pa.id = o.partner_id
      and pa.organization_id = ${org}
    group by h.variant_id, h.order_id, o.number, pa.name, o.expected_at,
      o.confirmed_at
  `;
}

/**
 * Usable stock by lot, its places left out (ADR-093, A6): each lot not
 * expired at the places marked available, summed over them, with how
 * many places hold it; stock with no lot as one row. What a released run
 * was issued at a place is taken from its lots there earliest expiry
 * first, as a release takes them, so the lots add up to usable stock
 * (usable-stock.ts) and the rest is the code's not usable. A lot whose
 * expiry is not known yet has no day, so it is usable and taken as a lot
 * with none (ADR-094, Q5a). Rows `variant_id, lot_id, lot_code,
 * expires_at, expiry, is_assigned, supplier_lot, quantity, places`, the
 * lot's three null with no lot.
 */
export function usableLotsOf(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      p.variant_id,
      p.lot_id,
      p.lot_code,
      p.expires_at,
      p.expiry,
      p.is_assigned,
      p.supplier_lot,
      sum(p.usable) as quantity,
      (count(*) filter (where p.usable > 0))::int as places
    from (
      select
        sl.variant_id,
        sl.lot_id,
        lt.code as lot_code,
        lt.expires_at,
        lt.expiry,
        lt.is_assigned,
        lt.supplier_lot,
        sl.quantity - greatest(0, least(
          sl.quantity,
          coalesce(u.issued, 0) - coalesce(sum(sl.quantity) over (
            partition by sl.variant_id, sl.location_id
            order by lt.expires_at asc nulls last, lt.code, sl.id
            rows between unbounded preceding and 1 preceding
          ), 0)
        )) as usable
      from stock_levels sl
      join locations loc
        on loc.id = sl.location_id
        and loc.organization_id = ${org}
      left join lots lt
        on lt.id = sl.lot_id
        and lt.organization_id = ${org}
      left join (${usableByLocation(organizationId, today, variants)}) u
        on u.variant_id = sl.variant_id
        and u.location_id = sl.location_id
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        and sl.quantity > 0
        and loc.is_available
        and (lt.expires_at is null or lt.expires_at >= ${today}::date)
    ) p
    group by p.variant_id, p.lot_id, p.lot_code, p.expires_at, p.expiry,
      p.is_assigned, p.supplier_lot
    having sum(p.usable) > 0
  `;
}
