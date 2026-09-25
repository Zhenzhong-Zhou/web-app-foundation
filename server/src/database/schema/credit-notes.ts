import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  date,
  index,
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
import { partners } from './partners';
import { billToSnapshot, sellerSnapshot } from './snapshots';
import { users } from './users';

/**
 * A document that reverses all or part of an issued invoice (ADR-046).
 *
 * Its own document, not a negative invoice or a flag: its own number series,
 * lines, stored amounts and snapshots, and a reference to what it credits.
 * Voiding an invoice issues one for the whole of it; credit notes for
 * returns, price corrections and uncollectable debts arrive with ADR-047.
 *
 * Created issued — there is no draft credit note yet — and never changed,
 * so every column describing it is required and there is no updated_at.
 * If ADR-047 needs drafts, that is a status column and relaxed checks.
 *
 * The seller and bill-to are copied from the invoice, not re-read: a credit
 * note must name the same parties as the invoice it reverses, even if the
 * customer has moved since.
 */
export const creditNotes = pgTable(
  'credit_notes',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * RESTRICT, and the reason an issued invoice can never be deleted even
     * by a bug: anything credited is held by what credited it.
     */
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'restrict' }),

    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),

    /** From the credit_note series of document_sequences. */
    number: text('number').notNull(),

    /** Always the invoice's currency. */
    currency: char('currency', { length: 3 }).notNull(),

    creditDate: date('credit_date', { mode: 'string' }).notNull(),

    /** Why: the first question about any credit, and printed on it. */
    reason: text('reason').notNull(),

    /**
     * The whole-invoice reversal a void writes. A void frees the shipment
     * for a new invoice; any other credit leaves the invoice issued and the
     * shipment billed, because the goods did leave.
     */
    isVoid: boolean('is_void').notNull().default(false),

    subtotal: numeric('subtotal', { precision: 18, scale: 4 }).notNull(),
    taxTotal: numeric('tax_total', { precision: 18, scale: 4 }).notNull(),
    total: numeric('total', { precision: 18, scale: 4 }).notNull(),

    ...sellerSnapshot(),
    ...billToSnapshot(),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'credit_notes_currency_format_check',
      sql`${t.currency} ~ '^[A-Z]{3}$'`,
    ),
    check(
      'credit_notes_reason_not_blank_check',
      sql`length(btrim(${t.reason})) > 0`,
    ),
    check(
      'credit_notes_total_check',
      sql`${t.total} = ${t.subtotal} + ${t.taxTotal}`,
    ),
    check(
      'credit_notes_amounts_not_negative_check',
      sql`${t.subtotal} >= 0 and ${t.taxTotal} >= 0`,
    ),

    // Both parties named, as on the invoice it reverses.
    check(
      'credit_notes_parties_check',
      sql`${t.sellerName} is not null and ${t.sellerLine1} is not null and ${t.sellerCountry} is not null
          and ${t.billToName} is not null and ${t.billToLine1} is not null and ${t.billToCountry} is not null`,
    ),

    uniqueIndex('credit_notes_org_number_key').on(t.organizationId, t.number),

    // An invoice is voided once.
    uniqueIndex('credit_notes_invoice_void_key')
      .on(t.invoiceId)
      .where(sql`${t.isVoid}`),

    // An invoice's credits, on its page.
    index('credit_notes_org_invoice_idx').on(t.organizationId, t.invoiceId),

    // A customer's credits, newest first.
    index('credit_notes_org_partner_date_idx').on(
      t.organizationId,
      t.partnerId,
      t.creditDate.desc(),
    ),
  ],
);
