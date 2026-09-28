import { sql } from 'drizzle-orm';
import { check, numeric, pgTable, unique, uuid } from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { lots } from './lots';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * What one pool of stock holds and is worth (ADR-048). The pool is the lot
 * for a tracked variant and the variant itself for one without lots.
 *
 * A cache of `stock_valuations`, as `stock_levels` is of `stock_movements`,
 * and for the same second reason: it is the row a movement locks. Two
 * shipments from one lot both reading the pool's average and both writing
 * would value the second against a balance that no longer existed.
 *
 * Not per location. Value does not change when stock moves between shelves,
 * so a transfer touches nothing here, and what one shelf holds is worth its
 * `stock_levels` quantity times this row's unit cost, computed.
 */
export const valuationPools = pgTable(
  'valuation_pools',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Null exactly when the variant does not track lots (ADR-023). */
    lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'restrict' }),

    /** The sum of `stock_levels` for this pool, across every location. */
    quantity: numeric('quantity', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),

    /**
     * In the organization's base currency. Six places rather than four: a
     * value is a quantity times a unit cost, and rounding it to four would
     * make a pool of cheap capsules drift by a visible amount.
     */
    value: numeric('value', { precision: 18, scale: 6 }).notNull().default('0'),

    ...timestamps,
  },
  (t) => [
    /**
     * NULLS NOT DISTINCT, as on `stock_levels`: an untracked variant's lot is
     * always null, and without it every movement would open a new pool. Check
     * the generated SQL carries it.
     */
    unique('valuation_pools_org_variant_lot_key')
      .on(t.organizationId, t.variantId, t.lotId)
      .nullsNotDistinct(),

    check(
      'valuation_pools_quantity_non_negative_check',
      sql`${t.quantity} >= 0`,
    ),

    /**
     * An empty pool is worth nothing. The last unit out takes whatever value
     * is left, so rounding never strands a few millionths in a pool that
     * holds no stock; this makes that a rule rather than a hope.
     */
    check(
      'valuation_pools_empty_has_no_value_check',
      sql`${t.quantity} > 0 or ${t.value} = 0`,
    ),
  ],
);
