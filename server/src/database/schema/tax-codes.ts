import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * A tax treatment an invoice line can carry (ADR-046): "GST", "GST + PST",
 * "Exempt". What it charges is its components, in their own table, so one
 * code can apply two taxes to the same amount and "Exempt" is simply a code
 * with none.
 *
 * Organization data rather than a built-in list, because rates differ by
 * country and region and change by law. An invoice copies the names and
 * rates it used at issue, so editing a code never rewrites an old invoice.
 *
 * Retired rather than deleted, like partners: invoice lines point at the
 * code they were drafted with.
 */
export const taxCodes = pgTable(
  'tax_codes',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** What the picker shows and the invoice prints: "GST + PST (BC)". */
    name: text('name').notNull(),

    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    check('tax_codes_name_not_blank_check', sql`length(btrim(${t.name})) > 0`),

    // Two codes with one name make the picker a guess.
    uniqueIndex('tax_codes_org_name_key').on(t.organizationId, t.name),
  ],
);
