import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { taxCodes } from './tax-codes';

/**
 * One tax a code charges: a name and a rate (ADR-046).
 *
 * A code with two components charges both on the same amount, which is how
 * a federal and a provincial sales tax apply together. On an invoice, tax is
 * summed per component across every line that carries it and rounded once,
 * so two codes sharing "GST 5%" print one GST line rather than two.
 */
export const taxCodeComponents = pgTable(
  'tax_code_components',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * CASCADE: a component has no meaning without its code. Invoices never
     * read through here after issue — they keep their own copy.
     */
    taxCodeId: uuid('tax_code_id')
      .notNull()
      .references(() => taxCodes.id, { onDelete: 'cascade' }),

    /** What the invoice's tax line says: "GST", "PST". */
    name: text('name').notNull(),

    /**
     * A percentage: 5.0000 is 5%. Stored as the number people read on a
     * notice from the tax authority, so nobody has to divide by a hundred in
     * their head to check it. Four places covers rates like 9.975%.
     */
    rate: numeric('rate', { precision: 7, scale: 4 }).notNull(),

    ...timestamps,
  },
  (t) => [
    check(
      'tax_code_components_name_not_blank_check',
      sql`length(btrim(${t.name})) > 0`,
    ),
    check(
      'tax_code_components_rate_range_check',
      sql`${t.rate} >= 0 and ${t.rate} <= 100`,
    ),

    // Two "GST" components on one code would charge it twice.
    uniqueIndex('tax_code_components_code_name_key').on(t.taxCodeId, t.name),
  ],
);
