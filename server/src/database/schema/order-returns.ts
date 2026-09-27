import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { locations } from './locations';
import { orders } from './orders';
import { organizations } from './organizations';
import { returnAuthorizations } from './return-authorizations';
import { users } from './users';

/**
 * Goods a customer sent back against a sales order (ADR-043).
 *
 * The mirror of a shipment: a header, with what came back recorded as
 * `return` movements that reference it — one per lot per line — so the ledger
 * stays the single record of stock arriving (ADR-023) and a recall can see
 * what was recovered.
 *
 * Returned stock lands wherever the person chooses, usually a location marked
 * unavailable, so nothing sends it out again until someone has checked it.
 * Restocking or writing it off afterwards is an ordinary move or correction,
 * not part of this record.
 *
 * `order_returns` rather than `returns`, which reads as a keyword in SQL.
 * Immutable, like a shipment: created_at and no updated_at.
 */
export const orderReturns = pgTable(
  'order_returns',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    toLocationId: uuid('to_location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),

    /**
     * The RMA this return was received against, if any (ADR-047). Held to
     * what it authorized. Nullable, because goods on the dock are a fact and
     * are recorded whether or not anyone agreed to them; set later, once,
     * when an RMA is raised afterwards for goods already back — the one
     * change a return ever sees.
     */
    returnAuthorizationId: uuid('return_authorization_id').references(
      () => returnAuthorizations.id,
      { onDelete: 'restrict' },
    ),

    /** Why it came back, in the customer's or the receiver's words. */
    reason: text('reason'),
    note: text('note'),

    /** RESTRICT, as orders and movements: ADR-012 anonymises, never deletes. */
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    index('order_returns_org_order_idx').on(t.organizationId, t.orderId),

    // What came back against an RMA. Partial: most returns name none yet.
    index('order_returns_return_authorization_idx')
      .on(t.returnAuthorizationId)
      .where(sql`${t.returnAuthorizationId} is not null`),
  ],
);
