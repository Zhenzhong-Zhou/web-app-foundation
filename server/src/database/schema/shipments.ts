import { sql } from 'drizzle-orm';
import {
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { locations } from './locations';
import { orders } from './orders';
import { organizations } from './organizations';
import { users } from './users';

/**
 * One box, pallet or parcel leaving against a sales order (ADR-041).
 *
 * A document rather than a line action, because outbound goods travel
 * together: five lines in one box, on one day, with one packing slip and one
 * tracking number. Receiving stays per line — a supplier's delivery is
 * checked in line by line — but a shipment is what a customer, a carrier and
 * a recall all ask about as a unit.
 *
 * What was shipped is not stored here. It is the `shipment` movements that
 * reference this row, one per lot per line, so the ledger stays the single
 * record of stock leaving (ADR-023) and a recall — which customers received
 * lot X — reads straight from it.
 *
 * Immutable, like a movement, with one exception: a shipment recorded before
 * the box actually left can be voided (ADR-041). Voiding writes the three
 * void columns once and never deletes the row — the shipment, its packing
 * slip and its movements stay, and reversing movements reference it. There is
 * still no updated_at: the void columns are the only change a shipment ever
 * sees, and they say when it happened themselves.
 */
export const shipments = pgTable(
  'shipments',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    fromLocationId: uuid('from_location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),

    /** Free text: "Canada Post", "customer pickup". No carrier integration yet. */
    carrier: text('carrier'),
    trackingNumber: text('tracking_number'),
    note: text('note'),

    /** RESTRICT, as orders and movements: ADR-012 anonymises, never deletes. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),

    /**
     * Set together when a shipment recorded too early is voided, and never
     * cleared. Null on every shipment that stands.
     */
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    /** Why: the first thing anyone reading the order afterwards will ask. */
    voidReason: text('void_reason'),
  },
  (t) => [
    // An order's shipments are read together, newest first, on its page.
    index('shipments_org_order_idx').on(t.organizationId, t.orderId),

    // All three or none: a void with no reason, or a reason with no void,
    // is a half-written record that no screen can explain.
    check(
      'shipments_void_complete_check',
      sql`(${t.voidedAt} is null) = (${t.voidedBy} is null) and (${t.voidedAt} is null) = (${t.voidReason} is null)`,
    ),
  ],
);
