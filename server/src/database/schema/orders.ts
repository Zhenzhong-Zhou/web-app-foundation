import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  char,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { addresses } from './addresses';
import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { partners } from './partners';
import { users } from './users';

/**
 * Which way the goods go. A column and not a table (ADR-027): two values the
 * service branches on explicitly, added at no runtime, carrying no attributes.
 * A lookup table would be a join to read a word.
 */
export const ORDER_DIRECTIONS = ['purchase', 'sale'] as const;

export type OrderDirection = (typeof ORDER_DIRECTIONS)[number];

/**
 * The order's lifecycle, the same in both directions (ADR-041). `fulfilled`
 * is a person saying the order is done — every line received or shipped, or
 * closed short — which is a decision rather than a calculation. The client
 * shows it as "Received" on a purchase and "Shipped" on a sale; one stored
 * value means one rule for what can still change, not two kept in step.
 */
export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'fulfilled',
  'cancelled',
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const orders = pgTable(
  'orders',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * RESTRICT, not CASCADE. Deleting a partner must not take the record of
     * what was bought from them — which is why partners are retired rather
     * than deleted (ADR-026).
     */
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),

    direction: text('direction').notNull(),

    status: text('status').notNull().default('draft'),

    /**
     * Their number for this order, not ours — a supplier's confirmation code,
     * a customer's PO reference. Nullable, because an order placed by phone has
     * none, and not unique, because two suppliers may reuse a number.
     */
    reference: text('reference'),

    /**
     * When the whole order is due. Per-line dates matter for staggered
     * deliveries and are recorded as an open decision — one date is right
     * until something arrives in two parts on purpose.
     *
     * timestamptz, though this is really a calendar day somebody typed rather
     * than a moment. A due date entered in Vancouver renders as the previous
     * day for a reader in Sydney. Harmless while everyone shares a timezone,
     * wrong the moment they do not — at which point this wants to be `date`,
     * and the migration is cheapest before real orders depend on it.
     */
    expectedAt: timestamp('expected_at', { withTimezone: true }),

    note: text('note'),

    /**
     * Where this order went, copied at creation rather than joined at read.
     *
     * NULL on every row today. A purchase order receives into a location — the
     * ship-to of a PO is our own warehouse, which lives in the location tree
     * and not in `addresses`. These fill in when sales orders arrive, which is
     * the same change that widens orders_status_check, since `received` does
     * not describe an outbound order.
     *
     * Added ahead of that rather than with it because the columns are free
     * while the table is small and the decision is already made (ADR-028).
     * They are a placeholder, not dead weight — do not drop them for looking
     * unused.
     *
     * The foreign key is provenance only: which address was chosen, so the
     * order can be traced back to a row someone can still see. Never read
     * through it to display where the order went. `addresses` holds what is
     * true now; these columns hold what was true that day, and joining
     * instead would let a partner moving warehouses silently rewrite where
     * last year's deliveries went.
     */
    shipToAddressId: uuid('ship_to_address_id').references(
      () => addresses.id,
      // No action: an address cannot vanish under a live order anyway.
      // Addresses retire rather than delete, and they only cascade away with
      // their partner — which orders already restrict.
      { onDelete: 'no action' },
    ),

    shipToLabel: text('ship_to_label'),
    shipToLine1: text('ship_to_line1'),
    shipToLine2: text('ship_to_line2'),
    shipToCity: text('ship_to_city'),
    shipToRegion: text('ship_to_region'),
    shipToPostalCode: text('ship_to_postal_code'),
    shipToCountry: char('ship_to_country', { length: 2 }),

    /**
     * Not null, and RESTRICT for the same reason movements use it: ADR-012
     * anonymises a departed user rather than removing the row, so the reference
     * stays resolvable and the order survives its author.
     */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * The order this one was copied from, when it was raised by duplicating a
     * wrong one (ADR-031).
     *
     * A column rather than leaving it to the audit log. `@Audited` records the
     * create, but the payload is JSONB and searching it is still open — so
     * "what replaced order X" would be unanswerable, and "why was this
     * cancelled, where did it go" are the two questions asked about every
     * cancelled order. It is also the one part of a duplicate that cannot be
     * reconstructed afterwards.
     *
     * RESTRICT, and orders are cancelled rather than deleted anyway, so the
     * link stays resolvable: the original is usually the cancelled one, and a
     * dangling reference would break the trail exactly where it is wanted.
     */
    duplicatedFromId: uuid('duplicated_from_id').references(
      (): AnyPgColumn => orders.id,
      { onDelete: 'restrict' },
    ),

    ...timestamps,
  },
  (t) => [
    check(
      'orders_direction_check',
      sql`${t.direction} in ('purchase', 'sale')`,
    ),
    check(
      'orders_status_check',
      sql`${t.status} in ('draft', 'confirmed', 'fulfilled', 'cancelled')`,
    ),

    /**
     * A snapshot is all of it or none of it. Half a copied address is worse
     * than no copy: it reads as a complete destination and is missing the
     * street. Nothing writes these yet, so the constraint costs nothing now
     * and is the thing that catches a partial write later.
     */
    check(
      'orders_ship_to_snapshot_check',
      sql`(${t.shipToLine1} is null and ${t.shipToCountry} is null)
          or (${t.shipToLine1} is not null and ${t.shipToCountry} is not null)`,
    ),

    check(
      'orders_ship_to_country_format_check',
      sql`${t.shipToCountry} is null or ${t.shipToCountry} ~ '^[A-Z]{2}$'`,
    ),

    // An order cannot be its own source. Cheap, and the only way this happens
    // is a bug, which is exactly when a constraint earns its place.
    check(
      'orders_no_self_duplicate_check',
      sql`${t.duplicatedFromId} is null or ${t.duplicatedFromId} <> ${t.id}`,
    ),

    // "What is open" and "what did we buy from them", the two reads the screens
    // make. created_at descending because a list of orders is newest first.
    index('orders_org_status_idx').on(t.organizationId, t.status),
    index('orders_org_partner_idx').on(t.organizationId, t.partnerId),
    index('orders_org_created_at_idx').on(t.organizationId, t.createdAt.desc()),
    index('orders_org_id_idx').on(t.organizationId, t.id.desc()),

    // "What replaced this one", and the lookup the RESTRICT foreign key runs
    // on every delete. Partial because almost no order is a duplicate.
    index('orders_duplicated_from_id_idx')
      .on(t.duplicatedFromId)
      .where(sql`${t.duplicatedFromId} is not null`),
  ],
);
