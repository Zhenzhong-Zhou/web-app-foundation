import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  numeric,
  pgTable,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { isCurrencyCode, primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * One rate per currency per day, entered by finance (ADR-048).
 *
 * The pair is this row's currency into the organization's base currency:
 * one unit of `currency` is worth `rate` units of the base. A bare number
 * with no pair is what ADR-035 warned against.
 *
 * A receipt takes the latest rate on or before its day and copies it onto
 * its valuation, so correcting a rate here changes nothing already valued.
 */
export const exchangeRates = pgTable(
  'exchange_rates',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    currency: char('currency', { length: 3 }).notNull(),

    /** A calendar day, as invoices use (ADR-046). */
    rateDate: date('rate_date', { mode: 'string' }).notNull(),

    rate: numeric('rate', { precision: 18, scale: 8 }).notNull(),

    ...timestamps,
  },
  (t) => [
    /**
     * One rate a day, which is also the lookup: latest on or before a
     * receipt's day reads this index backwards from that day.
     */
    uniqueIndex('exchange_rates_org_currency_date_key').on(
      t.organizationId,
      t.currency,
      t.rateDate,
    ),

    check('exchange_rates_rate_positive_check', sql`${t.rate} > 0`),

    check(
      'exchange_rates_currency_format_check',
      sql`${isCurrencyCode(t.currency)}`,
    ),
  ],
);
