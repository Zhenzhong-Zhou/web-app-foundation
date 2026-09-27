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
import { invoiceLines } from './invoice-lines';
import { organizations } from './organizations';

/**
 * Which taxes applied to one invoice line at issue, and at what rate
 * (ADR-047).
 *
 * `invoice_taxes` sums the components per invoice, and the line keeps only
 * its code's name. A partial credit needs to know, per line, what was
 * charged on the day — never the code's current rates, which may have
 * changed by law — so issuing records it here from the same calculation.
 *
 * Written at issue and never changed, so no updated_at.
 */
export const invoiceLineTaxes = pgTable(
  'invoice_line_taxes',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** CASCADE with the line, which cascades with a deleted draft. */
    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => invoiceLines.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    /** A percentage, as on the tax code: 5.0000 is 5%. */
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'invoice_line_taxes_rate_range_check',
      sql`${t.rate} >= 0 and ${t.rate} <= 100`,
    ),

    uniqueIndex('invoice_line_taxes_line_component_key').on(
      t.invoiceLineId,
      t.name,
      t.rate,
    ),
  ],
);
