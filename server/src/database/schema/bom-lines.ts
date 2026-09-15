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

import { boms } from './boms';
import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * What a recipe consumes (ADR-029).
 *
 * `component_variant_id` points at `product_variants` — the same table
 * `boms.output_variant_id` points at. That single choice is what makes nesting
 * free: if a blend that goes into three finished SKUs happens to have a BOM of
 * its own, the tree exists, and if it does not, the BOM is flat. Whether this
 * organization nests is data, not schema, and a recursive CTE written the day
 * someone asks reads a table that already holds the answer.
 *
 * The alternative — a `raw_materials` or `components` table separate from
 * products — is the version that costs a migration. A sub-assembly is both a
 * component and an output, so it belongs in both tables, and the day you make
 * in-house something you used to buy, its history is in the wrong one.
 */
export const bomLines = pgTable(
  'bom_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * CASCADE, for the reason `order_lines` gives: a line has no meaning
     * without its header. A recipe's lines are not a record of anything that
     * happened — what happened lives on the production order and in the ledger,
     * and both keep their own copies.
     */
    bomId: uuid('bom_id')
      .notNull()
      .references(() => boms.id, { onDelete: 'cascade' }),

    componentVariantId: uuid('component_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /**
     * How much of the component the whole batch consumes — against
     * `boms.output_quantity`, not against one unit of output.
     *
     * Expressed in the component variant's own `unit_of_measure`, always.
     * There is deliberately no unit column here: a second unit on the line
     * invites someone to type grams while stock is kept in kilograms, and
     * nothing in the system converts yet. That is the unit-of-measure
     * conversion decision (still open, ADR-023), and this table refuses to
     * open it early. The production order snapshots the unit, because a run is
     * a document; a recipe is a live definition and reads it from the variant.
     */
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),

    /**
     * Who provides this component on a run (ADR-030).
     *
     * stocked  — ours. We buy it, hold it, and the run consumes it, writing a
     *            `consumption` movement.
     * external — whoever manufactures provides it. It never enters our stock
     *            and the run writes no movement for it. The line still exists
     *            so the recipe is complete and so the arrangement is visible.
     *
     * A default, not a rule: the same herb extract is bought by us this quarter
     * and by the co-packer next quarter because their price changed. Who
     * supplies a component is a property of the run, so the production order
     * line carries the actual and may differ from this.
     *
     * Not on the variant, for exactly that reason.
     */
    supplyType: text('supply_type').notNull().default('stocked'),

    notes: text('notes'),

    ...timestamps,
  },
  (t) => [
    /**
     * One line per component. Two rows for the same ingredient makes "how much
     * of this does the recipe use" ambiguous, and amending the quantity is what
     * editing the line is for — the same call `order_lines` made.
     *
     * No `line_no`: ids are UUIDv7 (ADR-010), so insertion order is already the
     * sort order. Mixing *sequence* — add A, wait, then add B — is routing, and
     * routing is deferred.
     */
    uniqueIndex('bom_lines_bom_component_key').on(
      t.bomId,
      t.componentVariantId,
    ),

    /**
     * "Where is this used?" — every recipe consuming a given component. The
     * question a purchaser asks before accepting a discontinuation, and the
     * query a nesting explosion runs at each level.
     */
    index('bom_lines_org_component_idx').on(
      t.organizationId,
      t.componentVariantId,
    ),

    check('bom_lines_quantity_positive_check', sql`${t.quantity} > 0`),

    check(
      'bom_lines_supply_type_check',
      sql`${t.supplyType} in ('stocked', 'external')`,
    ),
  ],
);
