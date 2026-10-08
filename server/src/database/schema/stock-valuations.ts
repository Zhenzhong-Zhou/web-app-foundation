import { sql } from 'drizzle-orm';
import {
  boolean,
  char,
  check,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { isCurrencyCode, primaryKey } from './columns';
import { lots } from './lots';
import { organizations } from './organizations';
import { productVariants } from './product-variants';
import { stockMovements } from './stock-movements';
import { users } from './users';

/**
 * Why a value changed (ADR-048).
 *
 * movement   — what a stock movement carried; one per movement, transfers
 *              excepted.
 * run_close  — the share of a batch's cost still in its pool at close.
 * correction — the share of a corrected cost still in its pool.
 * issued     — the share of either that belongs to units already gone. Kept
 *              against the pool's history and never in its balance, so a
 *              pool equals the sum of its other rows.
 * opening    — the balance valuation started from, in migration 0033.
 */
export const VALUATION_KINDS = [
  'movement',
  'run_close',
  'correction',
  'issued',
  'opening',
] as const;

export type ValuationKind = (typeof VALUATION_KINDS)[number];

/**
 * Value is a ledger beside the quantity ledger (ADR-048). Append-only: nothing
 * updates a row and nothing deletes one, and a correction is a new row.
 *
 * Stored rather than computed on read for the reasons ADR-023 gave for
 * quantity. A figure that can be recomputed cannot say why a lot's value
 * changed. And a month already reported must not change afterwards: a price
 * corrected in March is a March event, not a rewrite of January.
 */
export const stockValuations = pgTable(
  'stock_valuations',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    lotId: uuid('lot_id').references(() => lots.id, { onDelete: 'restrict' }),

    kind: text('kind').notNull(),

    /** The movement this row values. Set exactly when kind is `movement`. */
    movementId: uuid('movement_id').references(() => stockMovements.id, {
      onDelete: 'restrict',
    }),

    /**
     * Signed, unlike a movement's: this ledger is summed, and direction is
     * what makes the sum a balance. Zero for rows that revalue a pool without
     * moving anything.
     */
    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),

    /** Signed, in the organization's base currency. */
    value: numeric('value', { precision: 18, scale: 6 }).notNull(),

    /**
     * What was paid, as it was paid, on acquisitions and their corrections: a
     * snapshot, never read through to the purchase line. The line says what
     * was agreed, this says what it cost, and correcting one must not rewrite
     * the other.
     */
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }),
    currency: char('currency', { length: 3 }),

    /**
     * The rate applied, copied rather than referenced: a rate corrected
     * later must not change what was already valued. Null when the price was
     * in the base currency, or when no rate was on file.
     */
    exchangeRate: numeric('exchange_rate', { precision: 18, scale: 8 }),

    /**
     * Valued at zero for want of a price, a rate or a run's close. A to-do,
     * cleared by a later row rather than by editing this one: a correction
     * that references it, or a run_close for the run that produced it.
     */
    needsCost: boolean('needs_cost').notNull().default(false),

    /**
     * What a row without a movement belongs to: `production_order` for a
     * run's close, `stock_valuation` for the row a correction corrects.
     */
    referenceType: text('reference_type'),
    referenceId: uuid('reference_id'),

    note: text('note'),

    /**
     * Who, as on movements (ADR-023). Null only for the opening rows, which a
     * migration wrote and nobody did.
     */
    actorId: uuid('actor_id').references(() => users.id, {
      onDelete: 'restrict',
    }),

    createdAt: timestamp('created_at', { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [
    /** One valuation per movement; a second would count its value twice. */
    uniqueIndex('stock_valuations_movement_key')
      .on(t.movementId)
      .where(sql`${t.movementId} is not null`),

    /** A pool's history, newest first. */
    index('stock_valuations_org_pool_created_at_idx').on(
      t.organizationId,
      t.variantId,
      t.lotId,
      t.createdAt.desc(),
    ),

    /**
     * A run's close rows, and the corrections of one valuation — which is
     * also how a needs-cost row is found to be cleared.
     */
    index('stock_valuations_org_reference_idx')
      .on(t.organizationId, t.referenceType, t.referenceId)
      .where(sql`${t.referenceType} is not null`),

    /**
     * Waiting valuations by pool. Partial: almost every row is valued.
     * The stock list's "Needs a cost" filter and Home's costs card ask,
     * for each stock row, whether its pool has one waiting; by pool, that
     * reads only the waiting rows, where the pool index above reads every
     * valuation of the variant (ADR-058 amended). Leading with the
     * organization, it also serves the needs-cost list.
     */
    index('stock_valuations_org_pool_needs_cost_idx')
      .on(t.organizationId, t.variantId, t.lotId)
      .where(sql`${t.needsCost}`),

    check(
      'stock_valuations_kind_check',
      sql`${t.kind} in ('movement', 'run_close', 'correction', 'issued', 'opening')`,
    ),

    check(
      'stock_valuations_movement_shape_check',
      sql`(${t.movementId} is not null) = (${t.kind} = 'movement')`,
    ),

    /**
     * Movements and the opening balance move quantity; everything else only
     * revalues what is there, or what has gone.
     */
    check(
      'stock_valuations_quantity_shape_check',
      sql`(${t.kind} in ('movement', 'opening')) = (${t.quantity} <> 0)`,
    ),

    check(
      'stock_valuations_needs_cost_is_zero_check',
      sql`not ${t.needsCost} or ${t.value} = 0`,
    ),

    check(
      'stock_valuations_price_currency_together_check',
      sql`(${t.unitPrice} is null) = (${t.currency} is null)`,
    ),

    check(
      'stock_valuations_unit_price_not_negative_check',
      sql`${t.unitPrice} is null or ${t.unitPrice} >= 0`,
    ),

    check(
      'stock_valuations_currency_format_check',
      sql`${t.currency} is null or ${isCurrencyCode(t.currency)}`,
    ),

    check(
      'stock_valuations_exchange_rate_check',
      sql`${t.exchangeRate} is null or (${t.exchangeRate} > 0 and ${t.unitPrice} is not null)`,
    ),

    check(
      'stock_valuations_actor_check',
      sql`${t.actorId} is not null or ${t.kind} = 'opening'`,
    ),
  ],
);
