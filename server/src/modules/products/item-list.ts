import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import type { KeyPart } from '../../common/sorted-page';
import { PRODUCT_TYPES, products } from '../../database/schema';
import { productNameOrder } from '../stock/item-name';
import { itemStock } from '../stock/item-stock';
import { categoryPaths } from './category-tree';
import {
  type ItemFiltersDto,
  type ItemSort,
  UNCATEGORISED,
} from './dto/list-products.dto';
import type { ProductCounts } from './dto/product-response.dto';
import type { ItemSearch } from './item-search';

/**
 * Items' order (ADR-092): its parts, the order's name for its cursor, and
 * what the query joins to sort by, each a left join. Paged by sorted-page's
 * keys, the cursor holding the last row's parts.
 *
 * - **Name,** the default: the name the reader sees, a Chinese one by its
 *   pinyin, the others accent-free (ADR-056), a number in it by its value
 *   (#305), then the id.
 * - **Category,** by its path from the top, the Uncategorised last either
 *   way; then the name, A to Z, and the id.
 * - **Stock,** fewest first unless reversed, itemStock's number, the one
 *   the row shows; an item whose variants' units differ last either way;
 *   then the name and the id.
 * - **Added and changed,** by when, then the id.
 *
 * While a search is typed, its rank comes first, the closest first
 * whichever way the sort runs (ADR-056, amended), read from itemSearch's
 * result, which the statement starts with.
 */
export function itemOrder(
  query: ItemFiltersDto,
  locale: Locale,
  organizationId: string,
  search: ItemSearch | null,
): { parts: KeyPart[]; order: string; joins: SQL } {
  const sort = query.sort ?? 'name';
  const way = query.order ?? 'asc';
  const name: KeyPart = {
    value: sql`(${productNameOrder(locale, organizationId)}) collate numeric_order`,
    type: 'text',
    order: 'asc',
  };
  const id: KeyPart = {
    value: sql`${products.id}`,
    type: 'uuid',
    order: 'asc',
  };
  const when = (column: SQL): KeyPart[] => [
    { value: sql`extract(epoch from ${column})`, type: 'numeric', order: way },
    { ...id, order: way },
  ];

  // The rank itemSearch worked out, joined rather than read again
  // (#547).
  const rank: KeyPart[] = search
    ? [{ value: search.rank, type: 'int', order: 'asc' }]
    : [];

  const byKey: Record<ItemSort, () => { parts: KeyPart[]; joins: SQL }> = {
    name: () => ({
      parts: [
        { ...name, order: way },
        { ...id, order: way },
      ],
      joins: sql``,
    }),
    category: () => ({
      parts: [
        { value: sql`(category.id is null)::int`, type: 'int', order: 'asc' },
        {
          value: sql`coalesce(category.sort_key, '') collate numeric_order`,
          type: 'text',
          order: way,
        },
        name,
        id,
      ],
      joins: sql`left join ${categoryPaths(organizationId)} category
        on category.id = ${products.categoryId}`,
    }),
    stock: () => ({
      parts: [
        { value: sql`(stock.on_hand is null)::int`, type: 'int', order: 'asc' },
        { value: sql`coalesce(stock.on_hand, 0)`, type: 'numeric', order: way },
        name,
        id,
      ],
      joins: sql`left join ${itemStock(organizationId)} stock
        on stock.product_id = ${products.id}`,
    }),
    added: () => ({ parts: when(sql`${products.createdAt}`), joins: sql`` }),
    changed: () => ({ parts: when(sql`${products.updatedAt}`), joins: sql`` }),
  };

  const { parts, joins } = byKey[sort]();
  return {
    parts: [...rank, ...parts],
    order: [sort, way, locale, search ? 'ranked' : 'unranked'].join(' '),
    joins: sql`${search?.join ?? sql``} ${joins}`,
  };
}

/**
 * What the list and its counts narrow to alike: its search, as
 * itemSearch found it, and its category with every category under it,
 * or Uncategorised. The type and Discontinued are shownOf's, which the
 * counts count by instead.
 */
export function matchedBy(
  query: ItemFiltersDto,
  search: ItemSearch | null,
  organizationId: string,
): SQL | undefined {
  const category =
    query.category === UNCATEGORISED
      ? isNull(products.categoryId)
      : query.category
        ? sql`${products.categoryId} in (
            select cp.id from ${categoryPaths(organizationId)} cp
            where ${query.category}::uuid = any(cp.ids)
          )`
        : undefined;

  return and(search?.found, category);
}

/** Discontinued items as asked: hidden, alone, or beside the rest. */
function discontinuedAs(query: ItemFiltersDto): SQL | undefined {
  if (query.discontinued === 'include') return undefined;
  return eq(products.isActive, query.discontinued !== 'only');
}

/** The open tab's type, and Discontinued as asked. */
export function shownOf(query: ItemFiltersDto): SQL | undefined {
  return and(
    query.type ? eq(products.type, query.type) : undefined,
    discontinuedAs(query),
  );
}

/** A type's counts, as countedOf counts them. */
export interface TypeCount {
  type: string;
  count: number;
  discontinued: number;
}

/**
 * The counts beside the list (ADR-092), each with its search and its
 * category: every type's tab, as Discontinued leaves it, and its
 * discontinued items, as one value for the first page's statement, which
 * reads itemSearch's result once for the page and its counts (#547).
 * A type is counted while the organization holds any item of it, so a
 * tab keeps its place while a search finds none there.
 */
export function countedOf(
  organizationId: string,
  query: ItemFiltersDto,
  matched: SQL | undefined,
): SQL {
  const found = matched ?? sql`true`;
  return sql`
    select coalesce(json_agg(c), '[]'::json) as counts from (
      select ${products.type} as type,
        (count(*) filter (
          where ${found} and ${discontinuedAs(query) ?? sql`true`}
        ))::int as count,
        (count(*) filter (
          where ${found} and not ${products.isActive}
        ))::int as discontinued
      from ${products}
      where ${products.organizationId} = ${organizationId}::uuid
      group by ${products.type}
    ) c
  `;
}

/**
 * The counts from countedOf's: every type's tab, All's, and the
 * Discontinued chip's, on the open tab.
 */
export function countsOf(
  rows: TypeCount[],
  query: ItemFiltersDto,
): ProductCounts {
  const types = PRODUCT_TYPES.flatMap((type) => {
    const row = rows.find((each) => each.type === type);
    return row ? [{ type, count: row.count }] : [];
  });
  const open = rows.filter((row) => !query.type || row.type === query.type);

  return {
    types,
    all: types.reduce((sum, type) => sum + type.count, 0),
    discontinued: open.reduce((sum, row) => sum + row.discontinued, 0),
  };
}
