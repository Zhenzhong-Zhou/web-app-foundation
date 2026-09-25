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
import { invoices } from './invoices';
import { orderLines } from './order-lines';
import { organizations } from './organizations';
import { productVariants } from './product-variants';
import { taxCodes } from './tax-codes';

/**
 * One item billed on an invoice (ADR-046).
 *
 * The quantity is what the shipment carried for that order line, and cannot
 * be edited: the invoice bills what left. Price and tax code default from
 * the order line and stay editable while the invoice is a draft.
 */
export const invoiceLines = pgTable(
  'invoice_lines',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /**
     * CASCADE, because deleting a draft takes its lines. An issued invoice
     * is never deleted — the service refuses, and a credit note's RESTRICT
     * reference holds it anyway.
     */
    invoiceId: uuid('invoice_id')
      .notNull()
      .references(() => invoices.id, { onDelete: 'cascade' }),

    orderLineId: uuid('order_line_id')
      .notNull()
      .references(() => orderLines.id, { onDelete: 'restrict' }),

    variantId: uuid('variant_id')
      .notNull()
      .references(() => productVariants.id, { onDelete: 'restrict' }),

    /** Snapshots, as the order line's: what the label said that day. */
    sku: text('sku').notNull(),
    description: text('description').notNull(),

    quantity: numeric('quantity', { precision: 18, scale: 4 }).notNull(),

    /** Not null: confirm refused a sale with an unpriced line (ADR-046). */
    unitPrice: numeric('unit_price', { precision: 18, scale: 4 }).notNull(),

    /**
     * Nullable on a draft, so a draft can exist before anyone chooses. The
     * service refuses to issue while any line lacks one — "no tax" is the
     * Exempt code, not a blank.
     */
    taxCodeId: uuid('tax_code_id').references(() => taxCodes.id, {
      onDelete: 'restrict',
    }),

    /** Written at issue, so the printed line keeps its code's name. */
    taxCodeName: text('tax_code_name'),

    /**
     * quantity × unit price, rounded to the currency's minor units. Written
     * at issue; null on a draft.
     */
    netAmount: numeric('net_amount', { precision: 18, scale: 4 }),

    ...timestamps,
  },
  (t) => [
    check('invoice_lines_quantity_positive_check', sql`${t.quantity} > 0`),
    check(
      'invoice_lines_unit_price_not_negative_check',
      sql`${t.unitPrice} >= 0`,
    ),
    check(
      'invoice_lines_net_amount_not_negative_check',
      sql`${t.netAmount} is null or ${t.netAmount} >= 0`,
    ),

    // One line per order line per invoice, as orders have one per variant.
    uniqueIndex('invoice_lines_invoice_order_line_key').on(
      t.invoiceId,
      t.orderLineId,
    ),

    // "How much of this order line has been billed."
    index('invoice_lines_org_order_line_idx').on(
      t.organizationId,
      t.orderLineId,
    ),
  ],
);
