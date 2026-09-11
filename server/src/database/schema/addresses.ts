import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { locations } from './locations';
import { organizations } from './organizations';
import { partners } from './partners';

/**
 * Postal addresses for anything that has one (ADR-028).
 *
 * One table with a real foreign key per owner kind and a check that exactly one
 * is set — not `owner_type`/`owner_id`. The polymorphic version cannot cascade
 * and cannot be constrained, which is how a table like this fills with rows
 * whose owner is gone and nothing notices.
 *
 * Adding an owner is a column, a widened check, and two indexes. It is meant to
 * look slightly odd; read ADR-028 before tidying it.
 */
export const addresses = pgTable(
  'addresses',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      // ADR-012: the org owns its data, including who it ships to.
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * Exactly one of these is set. Both cascade: an address outlives neither
     * the partner nor the site it describes, and there is no history pointing
     * at it — an order keeps its own snapshot of where it went.
     */
    partnerId: uuid('partner_id').references(() => partners.id, {
      onDelete: 'cascade',
    }),
    locationId: uuid('location_id').references(() => locations.id, {
      onDelete: 'cascade',
    }),

    /** "Head office", "Dock 3". What someone would call it out loud. */
    label: text('label'),

    line1: text('line1').notNull(),
    line2: text('line2'),
    city: text('city'),
    /** State, province, prefecture, county — whatever the country calls it. */
    region: text('region'),
    postalCode: text('postal_code'),

    /**
     * ISO-3166 alpha-2, and the only field here with a format. Shipping and tax
     * both need a machine-readable answer, and two letters is a vocabulary
     * rather than a pattern nobody can write for every country.
     */
    country: char('country', { length: 2 }).notNull(),

    /**
     * Flags rather than a `kind` column: one address is very often both, and a
     * single-value column forces a duplicate row to say so.
     */
    isBilling: boolean('is_billing').notNull().default(false),
    isShipping: boolean('is_shipping').notNull().default(false),

    /** What the order form reaches for first. At most one per owner. */
    isDefault: boolean('is_default').notNull().default(false),

    /**
     * Retired rather than deleted, matching contacts and everything else here.
     *
     * Nothing references an address — the order snapshots where it shipped
     * (ADR-028) — so a hard delete would be safe. It is still wrong: people
     * delete a warehouse address by accident and want it back, and "everywhere
     * we have ever shipped" is a question somebody eventually asks. The column
     * costs a filter; adding it later would cost a migration and an audit of
     * every query that reads this table.
     */
    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    // The whole shape in one line. Widen this when an owner is added — and
    // nowhere else, or a row with two owners becomes writable.
    check(
      'addresses_one_owner_check',
      sql`num_nonnulls(${t.partnerId}, ${t.locationId}) = 1`,
    ),

    check(
      'addresses_line1_not_blank_check',
      sql`length(btrim(${t.line1})) > 0`,
    ),

    // Uppercase, so 'ca' and 'CA' are not two countries.
    check('addresses_country_format_check', sql`${t.country} ~ '^[A-Z]{2}$'`),

    /**
     * One default per owner, enforced here rather than in the service. A second
     * default makes the picker choose arbitrarily, and nobody finds out until a
     * shipment arrives at the wrong dock.
     */
    uniqueIndex('addresses_partner_default_key')
      .on(t.partnerId)
      .where(sql`${t.isDefault} and ${t.partnerId} is not null`),
    uniqueIndex('addresses_location_default_key')
      .on(t.locationId)
      .where(sql`${t.isDefault} and ${t.locationId} is not null`),

    // One per owner column: only one is non-null per row, so a composite index
    // across them would never be used.
    index('addresses_partner_id_idx').on(t.partnerId),
    index('addresses_location_id_idx').on(t.locationId),
    index('addresses_organization_id_idx').on(t.organizationId),
  ],
);
