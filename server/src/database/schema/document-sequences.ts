import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
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
export const DOCUMENT_TYPES = ['invoice', 'credit_note'] as const;

export type DocumentType = (typeof DOCUMENT_TYPES)[number];

/**
 * The next number per organization per document type (ADR-046).
 *
 * Invoice numbers are gapless within an organization: the customer quotes
 * them and an auditor counts them. A number is taken inside the transaction
 * that issues the document, as an upsert that increments this row, so a
 * failed issue rolls the number back with everything else.
 *
 * A Postgres sequence was the alternative. Sequences are not transactional —
 * a rolled-back issue burns its number — and they are global rather than
 * per tenant.
 *
 * The cost: two issues in one organization at the same moment queue on this
 * row for the length of an issue. At the rate a business issues invoices,
 * that is invisible.
 *
 * Rows are created on first use, so a new organization needs no seeding.
 * No updated_at: the row is a counter, and when it moved is on the document
 * that took the number.
 */
export const documentSequences = pgTable(
  'document_sequences',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    documentType: text('document_type').notNull(),

    /**
     * The number the next document takes. bigint in mode number: a count of
     * documents stays far inside a JS double's exact range.
     */
    nextValue: bigint('next_value', { mode: 'number' }).notNull().default(1),
  },
  (t) => [
    primaryKey({
      name: 'document_sequences_pkey',
      columns: [t.organizationId, t.documentType],
    }),

    check(
      'document_sequences_document_type_check',
      sql`${t.documentType} in ('invoice', 'credit_note')`,
    ),

    check('document_sequences_next_value_check', sql`${t.nextValue} >= 1`),
  ],
);
