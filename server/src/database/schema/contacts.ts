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
import { locations } from './locations';
import { organizations } from './organizations';
import { partners } from './partners';

/**
 * People at the other end (ADR-028).
 *
 * Same ownership shape as `addresses`, and a separate table rather than a
 * merged "contact info" one: they share how they are owned, not what they hold.
 *
 * A contact is not a user. Nothing here signs in, holds a role, or is subject
 * to ADR-012's anonymization — these are names in a supplier's sales office,
 * recorded so an order has someone to chase.
 */
export const contacts = pgTable(
  'contacts',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Exactly one is set — see the check below. */
    partnerId: uuid('partner_id').references(() => partners.id, {
      onDelete: 'cascade',
    }),
    locationId: uuid('location_id').references(() => locations.id, {
      onDelete: 'cascade',
    }),

    name: text('name').notNull(),

    /**
     * What they do, in their words — "Accounts payable", "Warehouse manager".
     * Free text, not an enum: every organization names these differently and a
     * fixed list would be wrong for the second customer.
     */
    role: text('role'),

    /**
     * Not validated beyond a blank check, and deliberately not unique. The same
     * person appears at two partners when a rep changes employer, and a
     * shared inbox is one address for four people.
     */
    email: text('email'),
    phone: text('phone'),

    notes: text('notes'),

    /** Who to contact when nothing more specific applies. At most one per owner. */
    isPrimary: boolean('is_primary').notNull().default(false),

    /**
     * Retired rather than deleted, matching partners: a contact named on an
     * order that has already shipped is part of what happened.
     */
    isActive: boolean('is_active').notNull().default(true),

    ...timestamps,
  },
  (t) => [
    check(
      'contacts_one_owner_check',
      sql`num_nonnulls(${t.partnerId}, ${t.locationId}) = 1`,
    ),

    check('contacts_name_not_blank_check', sql`length(btrim(${t.name})) > 0`),

    /**
     * A contact with neither an email nor a phone is a name in a box. Not
     * enforcing both, because a warehouse contact often has only a phone and a
     * finance inbox often has only an address.
     */
    check(
      'contacts_reachable_check',
      sql`${t.email} is not null or ${t.phone} is not null`,
    ),

    uniqueIndex('contacts_partner_primary_key')
      .on(t.partnerId)
      .where(sql`${t.isPrimary} and ${t.partnerId} is not null`),
    uniqueIndex('contacts_location_primary_key')
      .on(t.locationId)
      .where(sql`${t.isPrimary} and ${t.locationId} is not null`),

    index('contacts_partner_id_idx').on(t.partnerId),
    index('contacts_location_id_idx').on(t.locationId),
    index('contacts_organization_id_idx').on(t.organizationId),
  ],
);
