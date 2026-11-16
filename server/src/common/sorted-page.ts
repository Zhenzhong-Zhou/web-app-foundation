import { BadRequestException } from '@nestjs/common';
import { gt, lt, type SQL, sql, type SQLWrapper } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { t } from '../i18n/translate';

/** Which way a sorted list runs (ADR-057). */
export type SortOrder = 'asc' | 'desc';
export const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

/**
 * The refusal of a cursor that is no place in this list: another
 * organization's row, one removed since, or a cursor made for another
 * order or not made here. A 400 rather than a 404 says nothing about
 * whether the row exists elsewhere. Every keyset list refuses with it.
 */
export function notInThisList(): BadRequestException {
  return new BadRequestException(
    t({
      id: 'stock.cursorList',
      defaultMessage: 'That cursor is not in this list',
    }),
  );
}

/**
 * A list sorted by a column, paged by keyset (ADR-057).
 *
 * Rows run by the value, then by id to break ties, the same way; rows with
 * no value (an order with no expected date) come last in either order. The
 * cursor stays what every list sends, the last row's id: the list reads that
 * row's value first (scoped to its organization, so another tenant's id is
 * not a place in the list), and the next page is everything after the pair
 * (value, id). A sorted list then never skips or repeats a row, however many
 * share a value.
 *
 * A list sorted by a figure worked out rather than kept on the row pages by
 * its key's values instead: orderOf, afterKeys, cursorOf and readKeys, below.
 */
export function sortedOrder(
  value: SQLWrapper,
  id: SQLWrapper,
  order: SortOrder,
): SQL[] {
  return order === 'asc'
    ? [sql`${value} asc nulls last`, sql`${id} asc`]
    : [sql`${value} desc nulls last`, sql`${id} desc`];
}

/**
 * The rows after the cursor row, in sortedOrder's order. Its value may be
 * null, in which case only later nulls follow it, by id.
 */
export function afterCursor(
  value: SQLWrapper,
  id: SQLWrapper,
  cursor: { value: string | null; id: string },
  order: SortOrder,
): SQL {
  const ahead = order === 'asc' ? sql`>` : sql`<`;

  if (cursor.value === null) {
    return sql`(${value} is null and ${id} ${ahead} ${cursor.id}::uuid)`;
  }
  return sql`(
    ${value} is null
    or ${value} ${ahead} ${cursor.value}
    or (${value} = ${cursor.value} and ${id} ${ahead} ${cursor.id}::uuid)
  )`;
}

/**
 * The order and the cursor condition for a list that may be sorted: by id,
 * newest first, as every list was, when no sort is asked for; by the value
 * and then id when one is. `readCursor` reads the cursor row's value as
 * text, scoped to the organization; undefined means it is not in this list.
 *
 * `byId: 'asc'` runs the id alone oldest first, by when each row was made
 * (ADR-010, ADR-057's amendment); only a list that takes it passes it,
 * Orders today. Its drafts the planner reads from `orders_pkey` forward,
 * across every organization, keeping the list's own rows: 1 ms at large,
 * growing with the older orders that are not drafts, which `perf:plans`
 * fails past 10 ms (review 78).
 */
export async function pagedBy(options: {
  id: SQLWrapper & AnyPgColumn;
  before?: string;
  byId?: SortOrder;
  sorted?: { value: SQLWrapper; order: SortOrder };
  readCursor: (
    before: string,
  ) => Promise<{ value: string | null; id: string } | undefined>;
}): Promise<{ where?: SQL; orderBy: SQL[] }> {
  const { id, before, byId, sorted, readCursor } = options;

  if (!sorted) {
    const oldestFirst = byId === 'asc';
    const after = oldestFirst ? gt : lt;
    return {
      where: before ? after(id, before) : undefined,
      orderBy: [oldestFirst ? sql`${id} asc` : sql`${id} desc`],
    };
  }

  let where: SQL | undefined;
  if (before) {
    const cursor = await readCursor(before);
    // Another tenant's row, or none: not a place in this list, and a 400
    // says nothing about whether it exists elsewhere.
    if (!cursor) throw notInThisList();
    where = afterCursor(sorted.value, id, cursor, sorted.order);
  }

  return { where, orderBy: sortedOrder(sorted.value, id, sorted.order) };
}

/**
 * A list sorted by a key of several parts, the id last, and paged by
 * keyset, the cursor holding the last row's parts, compared part by part
 * (ADR-092; #551's 60). Unlike pagedBy's cursor, a row's id read back, it
 * carries the values themselves: a rank, a stock or a figure is worked out,
 * not kept on the row, and reading it back would place the cursor where the
 * row is now, not where the page left it.
 */

/** What a part compares as: its cursor's text is cast back to it. */
type KeyType = 'text' | 'int' | 'numeric' | 'uuid';

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
export function readKeys(
  cursor: string,
  order: string,
  parts: KeyPart[],
): string[] {
  let read: unknown;
  try {
    read = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw notInThisList();
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
    throw notInThisList();
  }
  return v as string[];
}
