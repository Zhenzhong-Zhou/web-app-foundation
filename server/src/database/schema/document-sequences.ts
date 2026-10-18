import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { organizations } from './organizations';

/**
 * Which document series are numbered. A column and a check, as order
 * directions are (ADR-027): closed, and branched on by name.
 */
export const DOCUMENT_TYPES = [
  'invoice',
  'credit_note',
  'return_authorization',
  // An order's own number, taken when it is created (ADR-071, amended).
  'sale_order',
  'purchase_order',
] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * The next number per organization, series and period (ADR-046, ADR-073).
 *
 * Invoice numbers are gapless within a series and period: the customer
 * quotes them and an auditor counts them. A number is taken inside the
 * transaction that issues the document, as an upsert that increments this
 * row, so a failed issue rolls the number back with everything else.
 *
 * A Postgres sequence was the alternative. Sequences are not transactional —
 * a rolled-back issue burns its number — and they are global rather than
 * per tenant.
 *
 * The cost: two issues in one series and period at the same moment queue on
 * this row for the length of an issue. At the rate a business issues
 * invoices, that is invisible.
 *
 * Rows are created on first use, from the series' settings in
 * document_numbering. No updated_at: the row is a counter, and when it moved
 * is on the document that took the number.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    documentType: text('document_type').$type<DocumentType>().notNull(),

    /**
     * Which year, month or day this counter numbers (ADR-073): '' for a
     * series that never starts again, then 2026, 2026-10 or 2026-10-17,
     * from the document's own date. An earlier period stays open, so an
     * invoice dated 31 December and issued in January takes 2026's next.
     */
    period: text('period').notNull().default(''),

    /**
     * The prefix and width this period numbers with, the prefix as written
     * with its date tokens. Copied from the settings when the period opens,
     * and rewritten by a change for today's period and later ones only: an
     * earlier period goes on as it was, so a backdated invoice reads like the
     * rest of its year.
     */
    prefix: text('prefix').notNull(),
    digits: integer('digits').notNull(),

    /**
     * The number the next document takes. bigint in mode number: a count of
     * documents stays far inside a JS double's exact range.
     */
    nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1),
  },
  (t) => [
    primaryKey({
      name: 'document_sequences_pkey',
      columns: [t.organizationId, t.documentType, t.period],
    }),

    check(
      'document_sequences_document_type_check',
      sql`${t.documentType} in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order')`,
    ),

    check('document_sequences_next_value_check', sql`${t.nextValue} >= 1`),
    check(
      'document_sequences_period_check',
      sql`${t.period} ~ '^([0-9]{4}(-[0-9]{2}(-[0-9]{2})?)?)?$'`,
    ),
    check('document_sequences_digits_check', sql`${t.digits} between 1 and 10`),
  ],
);
