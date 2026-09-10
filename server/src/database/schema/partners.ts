import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';

/**
 * Anyone the organization trades with (ADR-026).
 *
 * One table rather than customers and suppliers, because one company is often
 * both — you buy packaging from a firm and sell them finished goods — and
 * merging two rows that already have orders pointing at them is the expensive
 * migration. Splitting later is a SELECT into a new table; merging is not.
 *
 * No is_customer or is_supplier flags. They go stale because nobody unsets
 * them, and a stale flag is a filter that quietly excludes the right answer.
 * What a partner is follows from what has been traded with them, which is a
 * join over orders.
 */
export const partners = pgTable(
  'partners',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the org owns its contacts.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    name: text('name').notNull(),

    /**
     * The organization's own reference — "ACME-01", a supplier number from an
     * accounting package. Typed, not generated, for the same reason a SKU is
     * (ADR-023): they already have one, and a second machine-made identifier
     * means every partner has two names and staff use the wrong one.
     */
    code: text('code'),

    /**
     * VAT, GST, EIN — whatever the jurisdiction calls it. One free-text column
     * rather than a type and a value, because nothing validates it and a
     * two-column split invites a validator nobody can write for every country.
     */
    taxId: text('tax_id'),

    notes: text('notes'),

    /**
     * Retired rather than deleted: a partner referenced by an order cannot be
     * removed without inventing gaps in the history the order exists to record.
     * Same reasoning as products and locations.
     */
    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    // Per organization, never globally: two customers using the same supplier
    // number is normal, and rejecting it would reveal the other tenant exists.
    uniqueIndex('partners_org_code_key')
      .on(t.organizationId, t.code)
      .where(sql`${t.code} is not null`),

    // The list screen, ordered by name within an organization.
    index('partners_org_name_idx').on(t.organizationId, t.name),

    check('partners_name_not_blank_check', sql`length(btrim(${t.name})) > 0`),
  ],
);
