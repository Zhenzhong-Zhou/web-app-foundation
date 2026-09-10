import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

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
 * The document's lifecycle, and nothing about how much has arrived.
 *
 * The temptation is `partially_received` and `fully_received` beside these.
 * That is stored arithmetic: progress is sum(quantity_fulfilled) against
 * sum(quantity_ordered) across the lines, and a copy of it goes stale the first
 * time a line changes (ADR-027).
 *
 * `received` is a person saying the order is done, which can be true of a short
 * shipment nobody expects to complete. That is a decision rather than a
 * calculation, which is why it belongs here and the percentages do not.
 *
 * Widening is expected when sales orders arrive — `received` does not describe
 * an outbound order — and costs a dropped and re-added constraint with no row
 * to rewrite.
 */
export const ORDER_STATUSES = [
  'draft',
  'confirmed',
  'received',
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
     * deliveries and are recorded as an open decision — one date is right until
     * something arrives in two parts on purpose.
     */
    expectedAt: timestamp('expected_at', { withTimezone: true }),

    note: text('note'),

    /**
     * Not null, and RESTRICT for the same reason movements use it: ADR-012
     * anonymises a departed user rather than removing the row, so the reference
     * stays resolvable and the order survives its author.
     */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    ...timestamps,
  },
  (t) => [
    check(
      'orders_direction_check',
      sql`${t.direction} in ('purchase', 'sale')`,
    ),
    check(
      'orders_status_check',
      sql`${t.status} in ('draft', 'confirmed', 'received', 'cancelled')`,
    ),

    // "What is open" and "what did we buy from them", the two reads the screens
    // make. created_at descending because a list of orders is newest first.
    index('orders_org_status_idx').on(t.organizationId, t.status),
    index('orders_org_partner_idx').on(t.organizationId, t.partnerId),
    index('orders_org_created_at_idx').on(t.organizationId, t.createdAt.desc()),
  ],
);
