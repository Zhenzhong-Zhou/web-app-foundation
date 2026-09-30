import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { isCurrencyCode, primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * Which side of a trade a list prices (ADR-049). What a customer is charged
 * and what a supplier charges are different policies with different owners;
 * one list serving both would be edited for one reason and silently change
 * the other.
 */
export const PRICE_LIST_DIRECTIONS = ['sale', 'purchase'] as const;

export type PriceListDirection = (typeof PRICE_LIST_DIRECTIONS)[number];

/**
 * A price list: the default a line takes when it is added without a price
 * (ADR-049). Policy that feeds an order, never part of one — the line keeps
 * its own copy of the price, and nothing reads the list again.
 *
 * One currency per list, since a sale must be single-currency at confirm
 * (ADR-046) and a mixed list would propose orders that cannot be confirmed.
 * Direction and currency are fixed once created: changing either would
 * reinterpret every price on it.
 *
 * Retired, never deleted, as tax codes are: a line may name the list its
 * price came from.
 */
export const priceLists = pgTable(
  'price_lists',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    direction: text('direction').notNull(),

    currency: char('currency', { length: 3 }).notNull(),

    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    /** Two lists called "Wholesale" is a picker nobody can use. */
    uniqueIndex('price_lists_org_name_key').on(t.organizationId, t.name),

    index('price_lists_org_direction_idx').on(t.organizationId, t.direction),

    check(
      'price_lists_direction_check',
      sql`${t.direction} in ('sale', 'purchase')`,
    ),

    check(
      'price_lists_currency_format_check',
      sql`${isCurrencyCode(t.currency)}`,
    ),

    check('price_lists_name_not_blank_check', sql`btrim(${t.name}) <> ''`),
  ],
);
