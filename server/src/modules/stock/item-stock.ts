import { type SQL, sql } from 'drizzle-orm';

import { codeFigures } from './code-figures';
import { onHandByItem } from './usable-stock';

/**
 * What a row of Items' list says of its stock (ADR-092): its worst code's
 * status, out before low, from its reorder points; nothing otherwise.
 */
export type ItemStockStatus = 'out' | 'low';

/**
 * Items' sort by stock (ADR-092): each item's on hand at every place,
 * summed in its variants' unit, or null where their units differ, which
 * sorts last; as rows `product_id, on_hand`, for every item, which the
 * sorted list joins. Read from the cache, stock_levels, and never stored
 * on the item (ADR-025). It is the number the row shows (itemFigures),
 * a code's figures' on hand added up the same way, so the number sorted
 * by is the number shown; summed here alone, without the rest of the
 * figures, since a sort reads every item. Every join names the
 * organization (ADR-003, ADR-051).
 */
export function itemStock(organizationId: string): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`(
    select
      pv.product_id,
      case when count(distinct pv.unit_of_measure) = 1
        then coalesce(sum(st.quantity), 0)::numeric(18, 4) end as on_hand
    from product_variants pv
    -- A code's on hand by the figures' own rule (usable-stock.ts).
    left join (
      select oh.variant_id, oh.on_hand as quantity
      from (${onHandByItem(organizationId)}) oh
    ) st on st.variant_id = pv.id
    where pv.organization_id = ${org}
    group by pv.product_id
  )`;
}

/**
 * Each item's stock from its codes' figures (ADR-093, 21a; #590), the
 * one read Inventory, Where it stands and Reorder read (code-figures.ts),
 * for the items in `products`, a parenthesised list or subquery of ids,
 * as one statement's rows `product_id, variants, unit, on_hand,
 * not_usable, status, status_codes`:
 *
 * - how many variants it has, and their unit where they share one;
 * - on hand at every place and the not usable part of it, each summed
 *   in that unit, or null where the units differ;
 * - its worst code's status, out before low, as Home and Reorder count
 *   them; null when none is either, a discontinued code never low; and
 *   how many of its codes share that status, "Low · 1 of 3 codes".
 */
export function itemFigures(
  organizationId: string,
  today: string,
  products: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;
  const variants = sql`(
    select v.id from product_variants v
    where v.organization_id = ${org} and v.product_id in ${products}
  )`;
  const shared = sql`count(distinct pv.unit_of_measure) = 1`;

  return sql`
    with f as materialized (${codeFigures(organizationId, today, variants)})
    select
      pv.product_id,
      count(*)::int as variants,
      case when ${shared} then min(pv.unit_of_measure) end as unit,
      case when ${shared}
        then sum(f.on_hand)::numeric(18, 4)::text end as on_hand,
      case when ${shared}
        then sum(f.not_usable)::numeric(18, 4)::text end as not_usable,
      case
        when bool_or(f.status = 'out') then 'out'
        when bool_or(f.status = 'low') then 'low'
      end as status,
      case
        when bool_or(f.status = 'out')
          then count(*) filter (where f.status = 'out')
        when bool_or(f.status = 'low')
          then count(*) filter (where f.status = 'low')
      end::int as status_codes
    from product_variants pv
    join f on f.variant_id = pv.id
    where pv.organization_id = ${org}
      and pv.product_id in ${products}
    group by pv.product_id
  `;
}

/**
 * The items low or out (ADR-093, 21a; #534's first half), as rows
 * `product_id`: those with a code low or out, the out among the low, as
 * Reorder's Low and Home's Low stock count codes. Worked out from the
 * codes with a reorder point alone, as Reorder's read starts, so its cost
 * grows with the points set, not the catalogue.
 */
export function lowItemsOf(organizationId: string, today: string): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    with f as materialized (${codeFigures(
      organizationId,
      today,
      sql`(
        select rp.variant_id from reorder_points rp
        where rp.organization_id = ${org}
      )`,
    )})
    select distinct pv.product_id
    from f
    join product_variants pv
      on pv.id = f.variant_id
      and pv.organization_id = ${org}
    where f.status in ('low', 'out')
  `;
}
