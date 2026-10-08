import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { invoices } from './invoices';
import { orders } from './orders';
import { organizations } from './organizations';
import { partners } from './partners';
import { users } from './users';

/**
 * An RMA's lifecycle (ADR-047). Created open — authorized when raised, with
 * no request step. Cancelled only while nothing has come back and nothing
 * has been credited; closed by a person after that.
 */
export const RETURN_AUTHORIZATION_STATUSES = [
  'open',
  'closed',
  'cancelled',
] as const;

export type ReturnAuthorizationStatus =
  (typeof RETURN_AUTHORIZATION_STATUSES)[number];

/**
 * A promise, made before anything moves, that a customer may send goods back
 * against a sale, and what happens to them (ADR-047).
 *
 * Its own document rather than a flag on the return: the authorization often
 * comes days before the goods, sometimes for goods that never come, and one
 * RMA is often received in more than one box. The return (ADR-043) stays the
 * record of what arrived; this is the record of what was agreed.
 *
 * What happens to each item is on its lines — credit, replace or none —
 * because one box often holds both a damaged unit and a wrong one.
 */
export const returnAuthorizations = pgTable(
  'return_authorizations',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** From the return_authorization series: RMA-000001. Given when raised. */
    number: text('number').notNull(),

    /**
     * The sale it is against. Annotated, because orders points back here for
     * replacements and the two initializers would otherwise infer each
     * other's types in a circle.
     */
    orderId: uuid('order_id')
      .notNull()
      .references((): AnyPgColumn => orders.id, { onDelete: 'restrict' }),

    /** Copied from the order so a customer's RMAs are one index away. */
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),

    /**
     * The invoice the customer quoted, when they quoted one — "part of
     * INV-000042". The credit defaults to it. Optional, because a customer
     * does not always know.
     */
    invoiceId: uuid('invoice_id').references(() => invoices.id, {
      onDelete: 'restrict',
    }),

    status: text('status').notNull().default('open'),

    /** Why the customer is sending it back: the first thing anyone asks. */
    reason: text('reason').notNull(),

    /**
     * False when the customer was told to keep or destroy the goods. Credit
     * then follows what was authorized, since no box will ever arrive to be
     * received.
     */
    expectsGoods: boolean('expects_goods').notNull().default(true),

    note: text('note'),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /** Set together, once, when a person closes it. */
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: uuid('closed_by').references(() => users.id, {
      onDelete: 'restrict',
    }),

    /** Set together, once, when cancelled before anything came back. */
    cancelledAt: timestamp('cancelled_at', { withTimezone: true }),
    cancelledBy: uuid('cancelled_by').references(() => users.id, {
      onDelete: 'restrict',
    }),

    // Its status changes, so it needs updated_at — and the trigger with it.
    ...timestamps,
  },
  (t) => [
    // Search (ADR-056): trigram indexes, which serve ILIKE '%…%' and close
    // matches; names through search_text, codes as stored.
    index('return_authorizations_number_trgm_idx').using(
      'gin',
      sql`${t.number} gin_trgm_ops`,
    ),
    check(
      'return_authorizations_status_check',
      sql`${t.status} in ('open', 'closed', 'cancelled')`,
    ),

    check(
      'return_authorizations_reason_not_blank_check',
      sql`length(btrim(${t.reason})) > 0`,
    ),

    // Closed means closed_at and closed_by, and nothing else carries them.
    check(
      'return_authorizations_closed_shape_check',
      sql`(${t.status} = 'closed') = (${t.closedAt} is not null)
          and (${t.closedAt} is null) = (${t.closedBy} is null)`,
    ),

    check(
      'return_authorizations_cancelled_shape_check',
      sql`(${t.status} = 'cancelled') = (${t.cancelledAt} is not null)
          and (${t.cancelledAt} is null) = (${t.cancelledBy} is null)`,
    ),

    uniqueIndex('return_authorizations_org_number_key').on(
      t.organizationId,
      t.number,
    ),

    // An order's RMAs, on its page.
    index('return_authorizations_org_order_idx').on(
      t.organizationId,
      t.orderId,
    ),

    // What is still open: the customer-service list.
    index('return_authorizations_org_status_idx').on(
      t.organizationId,
      t.status,
    ),

    // A customer's RMAs.
    index('return_authorizations_org_partner_idx').on(
      t.organizationId,
      t.partnerId,
    ),
  ],
);
