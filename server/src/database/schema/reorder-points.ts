import { sql } from 'drizzle-orm';
import {
  check,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * Whether an item is replenished by a purchase or by a run (ADR-085): what
 * the list offers for it, and who is told when it falls low.
 */
export const REORDER_SOURCES = ['bought', 'made'] as const;

export type ReorderSource = (typeof REORDER_SOURCES)[number];

/**
 * How much to order (ADR-085): just enough to reach the point; a fixed
 * quantity, in whole multiples of it, as suppliers sell in cases and
 * minimums; or up to a maximum above the point.
 */
export const REORDER_RULES = ['just_enough', 'fixed', 'maximum'] as const;

export type ReorderRule = (typeof REORDER_RULES)[number];

/**
 * An item's reorder point (ADR-085): one per item, across the locations
 * marked available. A table of stock's own, so the product page and the
 * catalogue do not change for a planning setting. An item with no row is
 * never low; removing the row is how it stops.
 *
 * Quantities in the item's own unit, as an order line's are.
 */
export const reorderPoints = pgTable(
  'reorder_points',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    // RESTRICT, as every reference to a variant: discontinuing, never
    // deleting, is how an item goes (ADR-023), and it keeps its point.
    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    source: text('source').notNull(),

    /** Low below this. */
    reorderPoint: numeric('reorder_point', {
      precision: 18,
      scale: 4,
    }).notNull(),

    rule: text('rule').notNull(),

    /** What a fixed rule orders in whole multiples of. Set exactly then. */
    fixedQuantity: numeric('fixed_quantity', { precision: 18, scale: 4 }),

    /** The level a maximum rule fills to. Set exactly then. */
    maximumQuantity: numeric('maximum_quantity', { precision: 18, scale: 4 }),

    /**
     * The hourly check's claim (ADR-064's pattern): set when the item is
     * told as low, cleared once it is not, so each fall is told once.
     */
    lowNotifiedAt: timestamp('low_notified_at', { withTimezone: true }),

    ...timestamps,
  },
  (t) => [
    /** One point per item, and the index a lookup by item reads. */
    uniqueIndex('reorder_points_org_variant_key').on(
      t.organizationId,
      t.variantId,
    ),

    check(
      'reorder_points_source_check',
      sql`${t.source} in ('bought', 'made')`,
    ),

    check(
      'reorder_points_rule_check',
      sql`${t.rule} in ('just_enough', 'fixed', 'maximum')`,
    ),

    check(
      'reorder_points_reorder_point_positive_check',
      sql`${t.reorderPoint} > 0`,
    ),

    check(
      'reorder_points_fixed_quantity_check',
      sql`(${t.fixedQuantity} is not null) = (${t.rule} = 'fixed') and (${t.fixedQuantity} is null or ${t.fixedQuantity} > 0)`,
    ),

    check(
      'reorder_points_maximum_quantity_check',
      sql`(${t.maximumQuantity} is not null) = (${t.rule} = 'maximum') and (${t.maximumQuantity} is null or ${t.maximumQuantity} > ${t.reorderPoint})`,
    ),
  ],
);
