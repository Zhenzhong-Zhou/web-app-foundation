import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  uuid,
} from 'drizzle-orm/pg-core';

import { boms } from './boms';
import { primaryKey, timestamps } from './columns';
import { locations } from './locations';
import { organizations } from './organizations';
import { partners } from './partners';
import { productVariants } from './product-variants';

/**
 * A run: making one variant out of others (ADR-030).
 *
 * ADR-027 kept this out of `orders` and gave the reason — an order has one
 * partner and lines pointing one way, while a run consumes and produces at
 * once. This is that separate shape. `stock_movements.reason` already carries
 * `production` and `consumption`, so the ledger needed no change.
 */
export const productionOrders = pgTable(
  'production_orders',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    outputVariantId: uuid('output_variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /**
     * Which recipe this came from. RESTRICT, and archived-not-deleted on the
     * BOM side, so the link stays resolvable — but the run does not depend on
     * it for correctness. The lines below are a snapshot taken at release, so
     * editing or archiving the recipe afterwards cannot change what this run
     * says it consumed. Same reasoning as the ship-to snapshot in 0012.
     *
     * Nullable: a one-off run with no recipe is real — a rework, a trial batch,
     * a sample. Those are the runs that later become a BOM.
     */
    bomId: uuid('bom_id').references(() => boms.id, { onDelete: 'restrict' }),

    /**
     * Null means we made it ourselves. Not null means a contract manufacturer
     * did, and this is who.
     *
     * One nullable column separates in-house from outsourced, the way
     * `stock_movements` encodes direction by which location column is null.
     * The alternative — a `kind` column, or two tables — states the same fact
     * twice and lets the two disagree.
     *
     * Note what this is *not* for: a manufacturer who buys every input and
     * hands over finished goods is a purchase order against them for the
     * output variant, not a run. Nothing of ours was consumed, so there is
     * nothing here to record (ADR-030).
     */
    partnerId: uuid('partner_id').references(() => partners.id, {
      onDelete: 'restrict',
    }),

    /**
     * Where it is made, and therefore where components are issued from and
     * output is received into. A leaf, as ADR-024 requires of anything stock
     * touches. For an outsourced run this is a leaf under the manufacturer's
     * own `site` — free-issued material is still ours, sitting somewhere else.
     */
    locationId: uuid('location_id')
      .notNull()
      .references(() => locations.id, { onDelete: 'restrict' }),

    quantityPlanned: numeric('quantity_planned', {
      precision: 18,
      scale: 4,
    }).notNull(),

    /**
     * What actually came out, written by the same transaction as the
     * `production` movement.
     *
     * Deliberately *not* bounded by quantity_planned, unlike
     * `order_lines.quantity_fulfilled`. An over-receipt against a purchase
     * order is a supplier's mistake; a batch yielding 1020 units against a
     * planned 1000 is ordinary manufacturing, and a constraint that rejects it
     * would push people into raising a second run to record one batch.
     */
    quantityProduced: numeric('quantity_produced', {
      precision: 18,
      scale: 4,
    })
      .notNull()
      .default('0'),

    /*
     * No output_lot_id, deliberately. A run can produce more than one lot —
     * it spans two days, QA splits it, part is packed for a different expiry
     * — and a single column holds one where the ledger holds many. That makes
     * it a cache that can only disagree with the record.
     *
     * The output lots are the `production` movements carrying this run's
     * reference: reference_type = 'production_order', reference_id = id. Each
     * one has its own lot_id, so a split batch needs no schema change
     * (ADR-030).
     */

    /**
     * draft     — being planned; nothing has moved.
     * released  — components issued, lines frozen as a snapshot.
     * completed — output received, consumption written. Terminal.
     * cancelled — abandoned. Terminal. Anything already issued is returned by
     *             its own movements, not by unwinding this row.
     */
    status: text('status').notNull().default('draft'),

    /**
     * What people call this run — a batch number, a works order from the
     * co-packer. Nullable, because a run planned in a hurry has none, and not
     * unique: a contract manufacturer's numbering is theirs, and two of them
     * can collide. Without it a run has no name at all, and its page is
     * titled by its planned quantity.
     */
    reference: text('reference'),

    notes: text('notes'),

    ...timestamps,
  },
  (t) => [
    index('production_orders_org_status_idx').on(t.organizationId, t.status),

    index('production_orders_org_output_idx').on(
      t.organizationId,
      t.outputVariantId,
    ),

    /** Keyset pagination on a UUIDv7 cursor, as ADR-018 established. */
    index('production_orders_org_id_idx').on(t.organizationId, t.id.desc()),

    check(
      'production_orders_quantity_planned_positive_check',
      sql`${t.quantityPlanned} > 0`,
    ),

    check(
      'production_orders_quantity_produced_not_negative_check',
      sql`${t.quantityProduced} >= 0`,
    ),

    check(
      'production_orders_status_check',
      sql`${t.status} in ('draft', 'released', 'completed', 'cancelled')`,
    ),
  ],
);
