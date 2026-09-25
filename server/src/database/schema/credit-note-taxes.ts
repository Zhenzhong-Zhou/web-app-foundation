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
import { creditNotes } from './credit-notes';
import { organizations } from './organizations';

/**
 * The tax lines a credit note prints, one per component — the invoice's
 * rule, rounded once per component (ADR-046). A void copies the invoice's
 * tax lines exactly, so the two cancel to the cent. Immutable.
 */
export const creditNoteTaxes = pgTable(
  'credit_note_taxes',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    creditNoteId: uuid('credit_note_id')
      .notNull()
      .references(() => creditNotes.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),

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
      'credit_note_taxes_rate_range_check',
      sql`${t.rate} >= 0 and ${t.rate} <= 100`,
    ),
    check(
      'credit_note_taxes_amounts_not_negative_check',
      sql`${t.taxableAmount} >= 0 and ${t.amount} >= 0`,
    ),

    uniqueIndex('credit_note_taxes_note_component_key').on(
      t.creditNoteId,
      t.name,
      t.rate,
    ),
  ],
);
