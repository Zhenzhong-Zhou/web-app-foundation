import { sql } from 'drizzle-orm';
import {
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey } from './columns';
import { locations } from './locations';
import { lots } from './lots';
import { organizations } from './organizations';
import { productVariants } from './product-variants';
import { users } from './users';

/**
 * Why a quantity changed. Direction is not a reason — inbound and outbound are
 * encoded by which location column is null (ADR-023).
 *
 * Damage, theft, expiry, breakage, and miscounts are all `adjustment` with a
 * reason_detail. They are the same operation and only the explanation differs,
 * and finance treats them differently from a receipt regardless.
 */
export const MOVEMENT_REASONS = [
  'receipt', // in, from a supplier
  'shipment', // out, to a customer
  'transfer', // between two locations
  'adjustment', // a person saying the system is wrong
  'production', // in, from a build
  'consumption', // out, into a build
  'sample', // out, not sold
  'return', // in, from a customer
] as const;

export type MovementReason = (typeof MOVEMENT_REASONS)[number];

/**
 * Append-only, like audit_log. Nothing updates a row here and nothing deletes
 * one.
 *
 * A mutable quantity column cannot answer "why does the system say 47 when the
 * shelf holds 45." A ledger can, and that question is the entire job. It is
 * also the hardest thing to retrofit: added later, every existing quantity has
 * unexplained provenance (ADR-023).
 */
export const stockMovements = pgTable(
  'stock_movements',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /**
     * Snapshot, not a join. A SKU is printed on a label and read over a phone,
     * and it stays editable — so a purchase order printed last March must keep
     * showing what was on the label at the time, while variant_id still
     * resolves to the current row (ADR-023).
     *
     * Same pattern as audit_log capturing ip at event time rather than joining
     * to a session row.
     */
    sku: text('sku').notNull(),

    lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'restrict' }),

    /**
     * Null marks direction. Both set is a transfer; only `to` is inbound; only
     * `from` is outbound.
     *
     * One row rather than two, because a transfer is one decision by one
     * person for one reason, and splitting it into a negative and a positive
     * means every history view has to reassemble the pair to describe what
     * happened.
     */
    fromLocationId: uuid('from_location_id').references(() => locations.id, {
      onDelete: 'restrict',
    }),
    toLocationId: uuid('to_location_id').references(() => locations.id, {
      onDelete: 'restrict',
    }),

    /** Always positive. Direction lives in the location columns, not the sign. */
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),

    reason: text('reason').notNull(),

    /** "damaged", "expired", "miscount". Free text under a closed reason. */
    reasonDetail: text('reason_detail'),

    /**
     * What caused this — a purchase order, a sales order, a stock count.
     * Nullable so a movement entered by hand today and one raised by an order
     * later are the same row: order management adds a reference, it does not
     * change the table, and existing rows stay valid.
     */
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),

    note: text('note'),

    /**
     * Not null. The movement *is* the record; @Audited (ADR-018) sits above it
     * and does not replace it. A manual adjustment with no name attached is
     * precisely the row someone will ask about.
     *
     * RESTRICT rather than the soft-delete cascade users normally get: ADR-012
     * anonymises a departed user rather than removing the row, so the
     * reference stays resolvable.
     */
    actorId: uuid('actor_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    /**
     * createdAt only — no updatedAt, because nothing updates. Importing the
     * shared `timestamps` helper would add a column that is a lie about how
     * this table works.
     */
    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /**
     * Indexed for the two reads that exist, and no others. This table is
     * write-heavy and append-only, so every index is paid for on every
     * movement.
     *
     * UUIDv7 keys mean inserts land at the right edge of each index rather
     * than scattering page splits across it (ADR-010) — the main write-path
     * cost of a growing ledger, already handled.
     */
    index('stock_movements_org_variant_created_at_idx').on(
      t.organizationId,
      t.variantId,
      t.createdAt.desc(),
    ),
    index('stock_movements_org_created_at_idx').on(
      t.organizationId,
      t.createdAt.desc(),
    ),

    check(
      'stock_movements_reason_check',
      sql`${t.reason} in ('receipt', 'shipment', 'transfer', 'adjustment', 'production', 'consumption', 'sample', 'return')`,
    ),

    check('stock_movements_quantity_positive_check', sql`${t.quantity} > 0`),

    // A movement that touches no location changed nothing and is a bug that
    // reached the database.
    check(
      'stock_movements_has_location_check',
      sql`${t.fromLocationId} is not null or ${t.toLocationId} is not null`,
    ),

    // A transfer to the same shelf it came from is a no-op row that makes
    // every history view show an event that did not happen.
    check(
      'stock_movements_distinct_locations_check',
      sql`${t.fromLocationId} is null or ${t.toLocationId} is null or ${t.fromLocationId} <> ${t.toLocationId}`,
    ),

    /**
     * A receipt explains itself; an adjustment is a person asserting the
     * system is wrong, and a blank one is unauditable (ADR-023).
     */
    check(
      'stock_movements_adjustment_note_check',
      sql`${t.reason} <> 'adjustment' or (${t.note} is not null and length(btrim(${t.note})) > 0)`,
    ),
  ],
);
