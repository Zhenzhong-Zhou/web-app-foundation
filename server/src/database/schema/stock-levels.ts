import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  unique,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { locations } from './locations';
import { lots } from './lots';
import { organizations } from './organizations';
import { productVariants } from './product-variants';

/**
 * How much of one variant sits at one location, in one lot. Derived from
 * `stock_movements` and updated in the same transaction — a cache for reads,
 * never the source of truth (ADR-023).
 *
 * Nothing writes `quantity` outside a movement. A second way to change a
 * number is the moment the ledger stops being authoritative, and the e2e
 * assertion that the sum of movements equals this row is what proves the two
 * have not drifted.
 *
 * This table also does a job that is not about reading: it is the row a
 * movement transaction locks. Two shipments of 8 against a balance of 10 both
 * read 10, both pass a service-level check, and the shelf ends at −6 — an
 * append-only ledger records that faithfully rather than preventing it. The
 * upsert takes a row lock even on the first movement for a shelf that has no
 * row yet, so the second transaction blocks and then reads the true balance
 * (ADR-025).
 */
export const stockLevels = pgTable(
  'stock_levels',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),

    /**
     * Null exactly when the variant does not track lots. A check constraint
     * cannot see product_variants.tracks_lots, so the invariant is enforced
     * in the service and asserted in e2e — the same choice ADR-023 made, kept
     * consistent so there is one place to look when it is violated.
     */
    lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'restrict' }),

    /**
     * numeric, never float, never integer.
     *
     * Raw material is weighed and packaging film is measured; a consumption of
     * 2.75 kg is not a rounding error, and an integer column forces every such
     * variant into a fictional base unit that leaks into every screen. Binary
     * floating point cannot represent 0.1, and a cache that drifts from its
     * ledger by 0.0000001 is a cache nobody trusts.
     *
     * node-postgres returns this as a string so it never passes through a JS
     * double, and that string is what the API returns. All arithmetic happens
     * in Postgres — a Number() anywhere on this path reintroduces exactly the
     * problem the column type avoids (ADR-025).
     */
    quantity: numeric('quantity', { precision: 18, scale: 4 })
      .notNull()
      .default('0'),

    ...timestamps,
  },
  (t) => [
    /**
     * NULLS NOT DISTINCT is the whole point, and PG15+ is what makes it
     * possible.
     *
     * By default Postgres treats nulls as distinct, so an untracked variant —
     * whose lot_id is always null — could accumulate unlimited duplicate rows
     * for the same shelf while this constraint stayed silent. The ON CONFLICT
     * upsert would then never conflict, and the cache would quietly fork into
     * several rows that each hold part of the answer.
     *
     * Verify the generated SQL actually contains NULLS NOT DISTINCT before
     * applying. If drizzle-kit drops it, the constraint goes in the
     * hand-written section of the migration alongside the updated_at trigger.
     */
    unique('stock_levels_org_variant_location_lot_key')
      .on(t.organizationId, t.variantId, t.locationId, t.lotId)
      .nullsNotDistinct(),

    // "What is on this shelf" — the read the receiving screen makes on every
    // location change.
    index('stock_levels_org_location_idx').on(t.organizationId, t.locationId),
    // "Where is this variant" — the read the product detail page makes.
    index('stock_levels_org_variant_idx').on(t.organizationId, t.variantId),

    /**
     * Not redundant with the service-level check that precedes it. Locking is
     * a claim about the service being correct; this is enforced whatever the
     * service believes, and turns a silent negative balance into an aborted
     * transaction. Same reasoning as the closed-set constraints on
     * products.type and auth_tokens.purpose.
     */
    check('stock_levels_quantity_non_negative_check', sql`${t.quantity} >= 0`),
  ],
);
