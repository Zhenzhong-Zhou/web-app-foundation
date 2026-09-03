import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { organizations } from './organizations';
import { products } from './products';

/**
 * The unit stock is counted in. Not a display concept — this is what a
 * purchase order line, a shipment, and a shelf count all refer to.
 *
 * Every product has at least one, auto-created when a product is saved with no
 * variation. The UI hides it behind a single SKU field. The overhead is one
 * row; the payoff is that `stock` joins to exactly one thing forever, with no
 * query ever branching on whether a product happens to have variants
 * (ADR-023).
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: primaryKey(),

    // Denormalised from products.organization_id so TenantDb can scope this
    // table directly (ADR-003). Without it every variant read needs a join to
    // products purely to find the tenant, and the invariant stops being
    // mechanical.
    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    productId: uuid('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),

    /**
     * Typed by a human, never generated. A SKU is printed on a label, read
     * over a phone, and typed into a supplier's system — the organization
     * already has one for every item, and a second machine-made identifier
     * means every item has two names. `id` handles machine identity.
     *
     * Unique per organization, never globally: rejecting a SKU because another
     * tenant uses it would reveal that tenant exists.
     */
    sku: text('sku').notNull(),

    /** "60ct", "Large / Blue". Null when the product has no variation. */
    name: text('name'),

    /** The unit `stock.quantity` is expressed in — each, kg, litre, case. */
    unitOfMeasure: text('unit_of_measure').notNull().default('each'),

    /**
     * Per variant, not global: a manufactured supplement needs lot numbers, a
     * box of paperclips does not, and supplier goods vary.
     *
     * The invariant this creates lives in the service — every stock row for a
     * tracked variant carries a batch_id, and none for an untracked one. A
     * check constraint cannot see across tables.
     */
    tracksBatches: boolean('tracks_batches').notNull().default(false),

    /**
     * Discontinued rather than deleted. A variant with movement history cannot
     * be removed without inventing gaps in the ledger (ADR-012's reasoning
     * applied to stock), so this is how a catalogue shrinks.
     *
     * Added now because retrofitting means changing every list query at once.
     */
    isActive: boolean('is_active').notNull().default(true),

    // Integers in a base unit, never floats. 0.1 + 0.2 shows up in shipping
    // quotes and pallet maths as a number nobody can reconcile.
    weightGrams: integer('weight_grams'),
    lengthMm: integer('length_mm'),
    widthMm: integer('width_mm'),
    heightMm: integer('height_mm'),

    // Item dimensions size a bin; case dimensions size a pallet and a freight
    // quote. Different questions, so both are kept.
    caseQuantity: integer('case_quantity'),
    caseLengthMm: integer('case_length_mm'),
    caseWidthMm: integer('case_width_mm'),
    caseHeightMm: integer('case_height_mm'),

    ...timestamps,
  },
  (t) => [
    uniqueIndex('product_variants_org_sku_key').on(t.organizationId, t.sku),
    index('product_variants_product_id_idx').on(t.productId),
    index('product_variants_organization_id_idx').on(t.organizationId),
    check(
      'product_variants_case_quantity_check',
      sql`${t.caseQuantity} is null or ${t.caseQuantity} > 0`,
    ),
  ],
);
