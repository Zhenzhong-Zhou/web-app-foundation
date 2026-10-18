import { sql } from 'drizzle-orm';
import {
  check,
  integer,
  pgTable,
  primaryKey,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { type DocumentType } from './document-sequences';
import { organizations } from './organizations';

/** When a series starts again from 1 (ADR-073). */
export const NUMBERING_RESETS = [
  'never',
  'yearly',
  'monthly',
  'daily',
] as const;

export type NumberingReset = (typeof NUMBERING_RESETS)[number];

/** Today's numbers, each organization's numbers until it changes them. */
export const DEFAULT_NUMBERING: Record<
  DocumentType,
  { prefix: string; digits: number; reset: NumberingReset }
> = {
  invoice: { prefix: 'INV-', digits: 6, reset: 'never' },
  credit_note: { prefix: 'CN-', digits: 6, reset: 'never' },
  return_authorization: { prefix: 'RMA-', digits: 6, reset: 'never' },
  sale_order: { prefix: 'SO-', digits: 6, reset: 'never' },
  purchase_order: { prefix: 'PO-', digits: 6, reset: 'never' },
};

/**
 * How each organization numbers each kind of document (ADR-073): a prefix,
 * which may carry the document's date as {YYYY}, {YY}, {MM} and {DD}, a
 * minimum width, and when the series starts again.
 *
 * A row per organization and series, written for every organization by the
 * migration and at registration, so taking a number always reads a real row.
 * The counters themselves are in document_sequences, one per period.
 *
 * No updated_at: who changed the numbering, and when, is in the audit log
 * (organization.numbering_updated).
 */
export const documentNumbering = pgTable(
  'document_numbering',
  {
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    documentType: text('document_type').$type<DocumentType>().notNull(),

    /** As written, date tokens included: INV-{YYYY}-. Empty for none. */
    prefix: text('prefix').notNull(),

    /** The least number of digits, padded with zeros; a longer number grows. */
    digits: integer('digits').notNull(),

    reset: text('reset').$type<NumberingReset>().notNull().default('never'),
  },
  (t) => [
    primaryKey({
      name: 'document_numbering_pkey',
      columns: [t.organizationId, t.documentType],
    }),
    check(
      'document_numbering_document_type_check',
      sql`${t.documentType} in ('invoice', 'credit_note', 'return_authorization', 'sale_order', 'purchase_order')`,
    ),
    check(
      'document_numbering_reset_check',
      sql`${t.reset} in ('never', 'yearly', 'monthly', 'daily')`,
    ),
    check('document_numbering_digits_check', sql`${t.digits} between 1 and 10`),
    // The service checks the prefix's form (numbering-format.ts); this only
    // keeps a runaway value out.
    check(
      'document_numbering_prefix_length_check',
      sql`length(${t.prefix}) <= 40`,
    ),
  ],
);
