import { BadRequestException } from '@nestjs/common';
import { and, eq, isNull, type SQL, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import type { SearchTerms } from '../../common/search';
import type { SortOrder } from '../../common/sorted-page';
import type { Transaction } from '../../database/database.module';
import {
  PRODUCT_TYPES,
  products,
  productVariants,
} from '../../database/schema';
import { t } from '../../i18n/translate';
import { productNameOrder } from '../stock/item-name';
import { itemStock } from '../stock/item-stock';
import { categoryPaths } from './category-tree';
import {
  type ItemSort,
  type ListProductsDto,
  UNCATEGORISED,
} from './dto/list-products.dto';
import type { ProductCounts } from './dto/product-response.dto';
import { foundBy, itemRank, variantsOf } from './item-search';

/**
 * Items' order and its cursor (ADR-092): the list is sorted by a key of
 * several parts, the id last, and paged by keyset, the cursor holding the
 * last row's parts, compared as a row. Unlike every other list's cursor,
 * a row's id read back, it carries the values themselves: a rank or a
 * stock is worked out, not kept on the row, and reading it back would
 * place the cursor where the row is now, not where the page left it.
 */

/** What a part compares as: its cursor's text is cast back to it. */
export type KeyType = 'text' | 'int' | 'numeric' | 'uuid';

/** One part of the order: never null, so a row comparison holds. */
export interface KeyPart {
  value: SQL;
  type: KeyType;
  order: SortOrder;
}

const SHAPES: Record<KeyType, (value: string) => boolean> = {
  text: () => true,
  int: (value) => /^-?\d{1,9}$/.test(value),
  numeric: (value) => /^-?\d{1,18}(\.\d{1,8})?$/.test(value),
  uuid: (value) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      value,
    ),
};

const NOT_IN_THIS_LIST = () =>
  new BadRequestException(
    t({
      id: 'stock.cursorList',
      defaultMessage: 'That cursor is not in this list',
    }),
  );

/** The parts as ORDER BY, each its own way. */
export function orderOf(parts: KeyPart[]): SQL[] {
  return parts.map((part) =>
    part.order === 'asc' ? sql`${part.value} asc` : sql`${part.value} desc`,
  );
}

/** A part's cursor value, cast back to what the part compares as. */
function typed(part: KeyPart, value: string): SQL {
  return sql`${value}::${sql.raw(part.type)}`;
}

/**
 * The rows after the cursor's, in orderOf's order: the first part beyond
 * its value, or equal and the rest after theirs. Written out part by part
 * rather than as one row comparison, which Postgres reads one way only,
 * while a part such as a search's rank runs ascending whichever way the
 * sort does.
 */
export function afterKeys(parts: KeyPart[], values: string[]): SQL {
  const [part, ...rest] = parts;
  const [value, ...others] = values;
  const beyond = part.order === 'asc' ? sql`>` : sql`<`;
  const cast = typed(part, value);

  if (rest.length === 0) return sql`${part.value} ${beyond} ${cast}`;
  return sql`(${part.value} ${beyond} ${cast}
    or (${part.value} = ${cast} and ${afterKeys(rest, others)}))`;
}

/**
 * The cursor after a row: the order it was made in, so a cursor from
 * another sort, direction or language is refused rather than misplaced,
 * and the row's parts as text. Base64url, so the address carries it as it
 * is.
 */
export function cursorOf(order: string, values: string[]): string {
  return Buffer.from(JSON.stringify({ o: order, v: values })).toString(
    'base64url',
  );
}

/**
 * The cursor's values, each checked against its part, or a 400: one made
 * for another order, or not made here, is no place in this list.
 */
export function readCursor(
  cursor: string,
  order: string,
  parts: KeyPart[],
): string[] {
  let read: unknown;
  try {
    read = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw NOT_IN_THIS_LIST();
  }

  const { o, v } = (read ?? {}) as { o?: unknown; v?: unknown };
  if (
    o !== order ||
    !Array.isArray(v) ||
    v.length !== parts.length ||
    !v.every(
      (value, index) =>
        typeof value === 'string' && SHAPES[parts[index].type](value),
    )
  ) {
    throw NOT_IN_THIS_LIST();
  }
  return v as string[];
}

/**
 * Items' order (ADR-092): its parts, the order's name for its cursor, and
 * what the query joins to sort by.
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
 * whichever way the sort runs (ADR-056, amended).
 */
export function itemOrder(
  query: ListProductsDto,
  locale: Locale,
  organizationId: string,
  terms: SearchTerms | null,
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

  const rank: KeyPart[] = terms
    ? [
        {
          value: sql`(
            select min(${itemRank(terms, locale, organizationId)})
            from ${productVariants} where ${variantsOf(organizationId)}
          )`,
          type: 'int',
          order: 'asc',
        },
      ]
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
    order: [sort, way, locale, terms ? 'ranked' : 'unranked'].join(' '),
    joins,
  };
}

/**
 * What the list and its counts narrow to alike: its search, and its
 * category with every category under it, or Uncategorised. The type and
 * Discontinued are shownOf's, which the counts count by instead.
 */
export function matchedBy(
  query: ListProductsDto,
  terms: SearchTerms | null,
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

  return and(terms ? foundBy(terms, organizationId) : undefined, category);
}

/** Discontinued items as asked: hidden, alone, or beside the rest. */
function discontinuedAs(query: ListProductsDto): SQL | undefined {
  if (query.discontinued === 'include') return undefined;
  return eq(products.isActive, query.discontinued !== 'only');
}

/** The open tab's type, and Discontinued as asked. */
export function shownOf(query: ListProductsDto): SQL | undefined {
  return and(
    query.type ? eq(products.type, query.type) : undefined,
    discontinuedAs(query),
  );
}

/**
 * The counts beside the list (ADR-092), each with its search and its
 * category: every type's tab, as Discontinued leaves it; All's; and the
 * Discontinued chip's, on the open tab. A type is listed while the
 * organization holds any item of it, so a tab keeps its place while a
 * search finds none there.
 */
export async function countsOf(
  tx: Transaction,
  organizationId: string,
  query: ListProductsDto,
  matched: SQL | undefined,
): Promise<ProductCounts> {
  const found = matched ?? sql`true`;
  const { rows } = await tx.execute<{
    type: string;
    count: number;
    discontinued: number;
  }>(sql`
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
  `);

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
