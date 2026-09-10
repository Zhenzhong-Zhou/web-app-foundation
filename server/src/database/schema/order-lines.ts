import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { orders } from './orders';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * What was ordered, and how much of it has arrived.
 *
 * Fulfilment is a quantity here rather than a status on the order (ADR-027):
 * receiving against a line writes an ordinary movement with reference_type and
 * reference_id set, and increments this in the same transaction. There is no
 * second ledger and no receipts table — a movement raised by an order is the
 * same row as one entered by hand, with a reference attached.
 */
export const orderLines = pgTable(
  'order_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * CASCADE, unlike every other foreign key here. A line has no meaning
     * without its order — it is not a record of anything that happened, only
     * of what was asked for. What happened is in the ledger, and those
     * movements survive.
     */
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /**
     * Snapshot, as movements do (ADR-023). A SKU stays editable, and an order
     * printed last March must keep showing what was on the label at the time
     * while variant_id still resolves to the current row.
     */
    sku: text('sku').notNull(),

    /**
     * numeric, never float, never integer — the same decision quantities got
     * in ADR-025, for the same reason. Ordering 2.75 kg of raw material is
     * ordinary, and node-postgres returns these as strings so no quantity
     * passes through a JS double.
     */
    quantityOrdered: numeric('quantity_ordered', {
      precision: 18,
      scale: 4,
    }).notNull(),

    /**
     * Starts at zero and only ever rises, written by the same transaction that
     * writes the movement. Never edited directly — a correction is another
     * movement, which is what keeps this and the ledger agreeing.
     */
    quantityFulfilled: numeric('quantity_fulfilled', {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default('0'),

    ...timestamps,
  },
  (t) => [
    /**
     * One line per variant per order. Two lines for the same item is a data
     * entry mistake that makes "how much of this did we order" ambiguous, and
     * amending a quantity is what editing the line is for.
     */
    uniqueIndex('order_lines_order_variant_key').on(t.orderId, t.variantId),

    index('order_lines_org_variant_idx').on(t.organizationId, t.variantId),

    check(
      'order_lines_quantity_ordered_positive_check',
      sql`${t.quantityOrdered} > 0`,
    ),

    /**
     * Fulfilment cannot go negative, and cannot exceed what was ordered.
     *
     * The upper bound is a real decision: an over-receipt happens — a supplier
     * ships a full case against a partial order — and this refuses it. The
     * alternative is a line that quietly reports 110% fulfilled, which no
     * screen renders sensibly. Receiving the excess as a movement with no
     * reference keeps the stock honest and the order truthful, and revisiting
     * this is a check constraint change if that proves too strict.
     */
    check(
      'order_lines_fulfilled_within_ordered_check',
      sql`${t.quantityFulfilled} >= 0 and ${t.quantityFulfilled} <= ${t.quantityOrdered}`,
    ),
  ],
);
