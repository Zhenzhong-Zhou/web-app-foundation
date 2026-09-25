import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { creditNotes } from './credit-notes';
import { invoiceLines } from './invoice-lines';
import { organizations } from './organizations';

/**
 * One invoice line credited, in whole or in part (ADR-046).
 *
 * Copies what it credits — SKU, description, price, tax code name — so the
 * credit note prints without reading the invoice. Immutable.
 */
export const creditNoteLines = pgTable(
  'credit_note_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    creditNoteId: uuid('credit_note_id')
      .notNull()
      .references(() => creditNotes.id, { onDelete: 'cascade' }),

    invoiceLineId: uuid('invoice_line_id')
      .notNull()
      .references(() => invoiceLines.id, { onDelete: 'restrict' }),

    sku: text('sku').notNull(),
    description: text('description').notNull(),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),

    /** The invoice line's code name, as printed there. */
    taxCodeName: text('tax_code_name'),

    netAmount: numeric('net_amount', { precision: 18, scale: 4 }).notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check('credit_note_lines_quantity_positive_check', sql`${t.quantity} > 0`),
    check(
      'credit_note_lines_amounts_not_negative_check',
      sql`${t.unitPrice} >= 0 and ${t.netAmount} >= 0`,
    ),

    uniqueIndex('credit_note_lines_note_invoice_line_key').on(
      t.creditNoteId,
      t.invoiceLineId,
    ),

    /**
     * "How much of this invoice line has been credited" — what ADR-047
     * checks so a line is never credited beyond what was billed.
     */
    index('credit_note_lines_org_invoice_line_idx').on(
      t.organizationId,
      t.invoiceLineId,
    ),
  ],
);
