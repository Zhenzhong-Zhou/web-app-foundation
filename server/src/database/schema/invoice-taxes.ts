import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { invoices } from './invoices';
import { organizations } from './organizations';

/**
 * The tax lines an issued invoice prints, one per component (ADR-046).
 *
 * Tax is summed per component — name and rate — over the net amounts of
 * every line whose code carries it, and rounded once here rather than per
 * line. Per-line rounding drifts by a cent a line on a long invoice.
 *
 * Written at issue and never changed, so no updated_at. The name and rate
 * are copies: a later change to the tax code rewrites nothing here.
 */
export const invoiceTaxes = pgTable(
  'invoice_taxes',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    /** A percentage, as on the tax code: 5.0000 is 5%. */
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),

    /** The sum of net amounts this was charged on. */
    taxableAmount: numeric('taxable_amount', {
      precision: 18,
      scale: 4,
    }).notNull(),

    amount: numeric('amount', { precision: 18, scale: 4 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'invoice_taxes_rate_range_check',
      sql`${t.rate} >= 0 and ${t.rate} <= 100`,
    ),
    check(
      'invoice_taxes_amounts_not_negative_check',
      sql`${t.taxableAmount} >= 0 and ${t.amount} >= 0`,
    ),

    // One line per component: two "GST 5%" lines would be one tax twice.
    uniqueIndex('invoice_taxes_invoice_component_key').on(
      t.invoiceId,
      t.name,
      t.rate,
    ),
  ],
);
