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
import { organizations } from './organizations';
import { productVariants } from './product-variants';
import { productionOrders } from './production-orders';

/**
 * What this run consumed — copied from the BOM at release, never read through
 * to it afterwards (ADR-029).
 *
 * This snapshot is the whole versioning story. Because the lines live here, a
 * run from last year keeps showing what it actually used even if the recipe was
 * edited, re-versioned, or archived since. `boms.version` is then a convenience
 * for people, not a load-bearing mechanism — which is why it could be a plain
 * integer with no effective dates.
 */
export const productionOrderLines = pgTable(
  'production_order_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** CASCADE, as `order_lines` and `bom_lines` both are, for their reason. */
    productionOrderId: uuid('production_order_id')
      .notNull()
      .references(() => productionOrders.id, { onDelete: 'cascade' }),

    componentVariantId: uuid('component_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Snapshot, as `order_lines` does. A SKU stays editable; this must not. */
    sku: text('sku').notNull(),

    /**
     * Snapshot of the component's unit at release. `bom_lines` has no unit
     * column and reads the variant live, because a recipe is a definition; a
     * run is a document, and a document that changes meaning when someone
     * edits a variant is not a record.
     */
    unitOfMeasure: text('unit_of_measure').notNull(),

    quantityPlanned: numeric('quantity_planned', {
      precision: 18,
      scale: 4,
    }).notNull(),

    /**
     * Written by the same transaction as the `consumption` movement. Stays at
     * zero for external lines — see the check below.
     */
    quantityConsumed: numeric('quantity_consumed', {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default('0'),

    /**
     * The actual arrangement for this run, defaulted from the BOM line and
     * overridable here. This is where "we supply the extract, they supply the
     * capsules and the bottle" is recorded.
     */
    supplyType: text('supply_type').notNull().default('stocked'),

    /**
     * For an external line: the lot number the manufacturer reports for the
     * input they provided.
     *
     * Free text, and pointedly not a `lots` row. A lot we never held has no
     * stock balance anywhere, and creating one to hold a code puts phantom
     * quantity in the ledger. A supplement recall traces through every input,
     * including the ones we did not buy, so the code has to be somewhere — and
     * this is somewhere that cannot be mistaken for stock.
     */
    externalLotCode: text('external_lot_code'),

    notes: text('notes'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('production_order_lines_order_component_key').on(
      t.productionOrderId,
      t.componentVariantId,
    ),

    index('production_order_lines_org_component_idx').on(
      t.organizationId,
      t.componentVariantId,
    ),

    check(
      'production_order_lines_quantity_planned_positive_check',
      sql`${t.quantityPlanned} > 0`,
    ),

    check(
      'production_order_lines_supply_type_check',
      sql`${t.supplyType} in ('stocked', 'external')`,
    ),

    /**
     * The design, as a constraint. An external component never entered our
     * stock, so consuming it is not a thing that can have happened — and a
     * non-zero quantity here would mean a `consumption` movement exists for
     * material we never received, which is the exact way a ledger stops
     * balancing.
     */
    check(
      'production_order_lines_external_consumes_nothing_check',
      sql`${t.quantityConsumed} >= 0 and (${t.supplyType} <> 'external' or ${t.quantityConsumed} = 0)`,
    ),

    /**
     * A manufacturer's lot code on a line we supplied ourselves means someone
     * has recorded the wrong thing — our own lot is on the movement.
     */
    check(
      'production_order_lines_external_lot_code_check',
      sql`${t.externalLotCode} is null or ${t.supplyType} = 'external'`,
    ),
  ],
);
