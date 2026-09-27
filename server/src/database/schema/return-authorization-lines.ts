import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { orderLines } from './order-lines';
import { organizations } from './organizations';
import { productVariants } from './product-variants';
import { returnAuthorizations } from './return-authorizations';

/** What happens to an item that comes back (ADR-047). */
export const RETURN_RESOLUTIONS = ['credit', 'replace', 'none'] as const;

export type ReturnResolution = (typeof RETURN_RESOLUTIONS)[number];

/**
 * One item a customer may send back, how many, and what happens to it
 * (ADR-047).
 *
 * The quantity is a ceiling: returns against the RMA can bring back at most
 * this much, and credits against this line can credit at most this much.
 * Immutable once raised — a different agreement is a different RMA, as a
 * different quantity shipped is a different shipment.
 */
export const returnAuthorizationLines = pgTable(
  'return_authorization_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** CASCADE: lines have no meaning without their RMA. */
    returnAuthorizationId: uuid('return_authorization_id')
      .notNull()
      .references(() => returnAuthorizations.id, { onDelete: 'cascade' }),

    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'restrict' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Snapshot, as the order line's: what the label said that day. */
    sku: text('sku').notNull(),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),

    resolution: text('resolution').notNull(),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    check(
      'return_authorization_lines_quantity_positive_check',
      sql`${t.quantity} > 0`,
    ),

    check(
      'return_authorization_lines_resolution_check',
      sql`${t.resolution} in ('credit', 'replace', 'none')`,
    ),

    // One line per order line per RMA, as orders have one per variant.
    uniqueIndex('return_authorization_lines_rma_order_line_key').on(
      t.returnAuthorizationId,
      t.orderLineId,
    ),

    // "What has been authorized against this order line" across RMAs.
    index('return_authorization_lines_org_order_line_idx').on(
      t.organizationId,
      t.orderLineId,
    ),
  ],
);
