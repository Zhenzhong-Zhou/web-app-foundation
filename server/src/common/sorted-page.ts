import { BadRequestException } from '@nestjs/common';
import { lt, type SQL, sql, type SQLWrapper } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { t } from '../i18n/translate';

/** Which way a sorted list runs (ADR-057). */
export type SortOrder = 'asc' | 'desc';
export const SORT_ORDERS: readonly SortOrder[] = ['asc', 'desc'];

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
 */
export async function pagedBy(options: {
  id: SQLWrapper & AnyPgColumn;
  before?: string;
  sorted?: { value: SQLWrapper; order: SortOrder };
  readCursor: (
    before: string,
  ) => Promise<{ value: string | null; id: string } | undefined>;
}): Promise<{ where?: SQL; orderBy: SQL[] }> {
  const { id, before, sorted, readCursor } = options;

  if (!sorted) {
    return {
      where: before ? lt(id, before) : undefined,
      orderBy: [sql`${id} desc`],
    };
  }

  let where: SQL | undefined;
  if (before) {
    const cursor = await readCursor(before);
    // Another tenant's row, or none: not a place in this list, and a 400
    // says nothing about whether it exists elsewhere.
    if (!cursor) {
      throw new BadRequestException(
        t({
          id: 'stock.cursorList',
          defaultMessage: 'That cursor is not in this list',
        }),
      );
    }
    where = afterCursor(sorted.value, id, cursor, sorted.order);
  }

  return { where, orderBy: sortedOrder(sorted.value, id, sorted.order) };
}
