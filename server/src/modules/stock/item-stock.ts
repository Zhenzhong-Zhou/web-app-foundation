import { type SQL, sql } from 'drizzle-orm';

import { positionsOf } from './reorder-position';

/**
 * What a row of Items' list says of its stock (ADR-092): low, or out, from
 * its reorder points; nothing otherwise.
 */
export const ITEM_STOCK_STATUSES = ['out', 'low'] as const;

export type ItemStockStatus = (typeof ITEM_STOCK_STATUSES)[number];

/**
 * Each item's variants and its stock on hand (ADR-092), as rows
 * `product_id, variants, unit, on_hand`: how many variants it has; their
 * unit, where they share one; and on hand in every location, as
 * Inventory lists it, summed in that unit, or null where the units
 * differ, which a list shows as its number of variants instead. Read from
 * the cache, stock_levels, and never stored on the item (ADR-025).
 *
 * For the items in `products`, a parenthesised list or subquery of ids,
 * which reads the stock of their variants alone; or every item, which a
 * list sorted by stock joins. Either way the number sorted by is the
 * number shown. Every join names the organization (ADR-003, ADR-051).
 */
export function itemStock(organizationId: string, products?: SQL): SQL {
  const org = sql`${organizationId}::uuid`;
  const only = products ? sql`and pv.product_id in ${products}` : sql``;

  return sql`(
    select
      pv.product_id,
      count(*)::int as variants,
      case when count(distinct pv.unit_of_measure) = 1
        then min(pv.unit_of_measure) end as unit,
      case when count(distinct pv.unit_of_measure) = 1
        then coalesce(sum(st.quantity), 0)::numeric(18, 4) end as on_hand
    from product_variants pv
    left join (
      select sl.variant_id, sum(sl.quantity) as quantity
      from stock_levels sl
      join product_variants v
        on v.id = sl.variant_id
        and v.organization_id = ${org}
      where sl.organization_id = ${org}
        ${products ? sql`and v.product_id in ${products}` : sql``}
      group by sl.variant_id
    ) st on st.variant_id = pv.id
    where pv.organization_id = ${org}
      ${only}
    group by pv.product_id
  )`;
}

/**
 * Each item's status from its reorder points (ADR-085, ADR-092), as rows
 * `product_id, status`, for the items in `products` that are low or out:
 * out where any of its variants is out, else low where any is low, as
 * Home's Low stock counts them. A discontinued item, or variant, is never
 * low (positionsOf).
 */
export function itemStockStatus(
  organizationId: string,
  today: string,
  products: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;
  const variants = sql`(
    select v.id from product_variants v
    where v.organization_id = ${org} and v.product_id in ${products}
  )`;

  return sql`(
    select
      pv.product_id,
      case
        when bool_or(p.status = 'out') then 'out'
        else 'low'
      end as status
    from (${positionsOf(organizationId, today, variants)}) p
    join product_variants pv
      on pv.id = p.variant_id
      and pv.organization_id = ${org}
    where p.status in ('out', 'low')
    group by pv.product_id
  )`;
}
