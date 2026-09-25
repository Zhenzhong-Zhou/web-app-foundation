import { sql } from 'drizzle-orm';
import {
  char,
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { primaryKey, timestamps } from './columns';
import { orders } from './orders';
import { organizations } from './organizations';
import { partners } from './partners';
import { shipments } from './shipments';
import { billToSnapshot, sellerSnapshot } from './snapshots';
import { users } from './users';

/**
 * An invoice's lifecycle (ADR-046). Paid is not a status: it needs payments
 * recorded against the invoice, which are deferred. Issued means sent and
 * owed, nothing more.
 */
export const INVOICE_STATUSES = ['draft', 'issued', 'voided'] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

/**
 * What a customer owes for one shipment (ADR-046).
 *
 * A draft is a working copy: no number, prices and tax codes editable,
 * deletable. Issuing assigns the number and date, stores every amount,
 * copies every name and address, and freezes the row. After that the only
 * change it ever sees is a void, which a credit note records in full.
 *
 * Amounts are stored, unlike an order's (ADR-035). An order can still
 * change, so a stored total would drift; an issued invoice cannot, and must
 * read the same in ten years whatever happens to rounding code, tax rates
 * or the order it came from.
 */
export const invoices = pgTable(
  'invoices',
  {
    id: primaryKey(),

    organizationId: uuid('organization_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** RESTRICT throughout: an invoice outlives nothing it bills for. */
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'restrict' }),

    /**
     * The shipment this bills, exactly as it left. One standing invoice per
     * shipment, enforced by the partial unique index below; a voided one
     * stays beside its replacement.
     */
    shipmentId: uuid('shipment_id')
      .notNull()
      .references(() => shipments.id, { onDelete: 'restrict' }),

    /** Copied from the order so a customer's invoices are one index away. */
    partnerId: uuid('partner_id')
      .notNull()
      .references(() => partners.id, { onDelete: 'restrict' }),

    status: text('status').notNull().default('draft'),

    /**
     * Assigned at issue from document_sequences, never at draft: a deleted
     * draft would otherwise leave a gap. Text, because the printed number
     * carries a prefix.
     */
    number: text('number'),

    /** The order's one currency — confirm guarantees there is only one. */
    currency: char('currency', { length: 3 }).notNull(),

    /**
     * Calendar days, so `date` rather than timestamptz — the first in the
     * schema, and the reason #20 exists for the older columns. mode string,
     * so '2026-09-25' never passes through a JS Date and a timezone.
     */
    invoiceDate: date('invoice_date', { mode: 'string' }),
    dueDate: date('due_date', { mode: 'string' }),

    /** Printed on the invoice: "Thank you — PO 4471". */
    note: text('note'),

    /**
     * Written once, at issue, already rounded to the currency's minor
     * units. Null on a draft, whose amounts are computed when read.
     */
    subtotal: numeric('subtotal', { precision: 18, scale: 4 }),
    taxTotal: numeric('tax_total', { precision: 18, scale: 4 }),
    total: numeric('total', { precision: 18, scale: 4 }),

    ...sellerSnapshot(),
    ...billToSnapshot(),

    /**
     * Where the goods went, copied from the order's own snapshot. Optional:
     * the order's ship-to may be empty, and an invoice is valid without one.
     */
    shipToLabel: text('ship_to_label'),
    shipToLine1: text('ship_to_line1'),
    shipToLine2: text('ship_to_line2'),
    shipToCity: text('ship_to_city'),
    shipToRegion: text('ship_to_region'),
    shipToPostalCode: text('ship_to_postal_code'),
    shipToCountry: char('ship_to_country', { length: 2 }),

    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),

    issuedAt: timestamp('issued_at', { withTimezone: true }),
    issuedBy: uuid('issued_by').references(() => users.id, {
      onDelete: 'restrict',
    }),

    /** Set together, once, by a void; the credit note says the rest. */
    voidedAt: timestamp('voided_at', { withTimezone: true }),
    voidedBy: uuid('voided_by').references(() => users.id, {
      onDelete: 'restrict',
    }),
    voidReason: text('void_reason'),

    // A draft is edited, so it needs updated_at — and the trigger with it.
    ...timestamps,
  },
  (t) => [
    check(
      'invoices_status_check',
      sql`${t.status} in ('draft', 'issued', 'voided')`,
    ),

    check('invoices_currency_format_check', sql`${t.currency} ~ '^[A-Z]{3}$'`),

    /**
     * A draft has none of what issuing writes. A number on a draft would be
     * a number the customer might never see, which is a gap.
     */
    check(
      'invoices_draft_shape_check',
      sql`${t.status} <> 'draft' or (
            ${t.number} is null and ${t.issuedAt} is null and ${t.issuedBy} is null
            and ${t.subtotal} is null and ${t.taxTotal} is null and ${t.total} is null
          )`,
    ),

    /**
     * Anything past draft is complete: numbered, dated, totalled, and
     * naming both parties. The service fills these in one statement; this
     * catches the day one is forgotten.
     */
    check(
      'invoices_issued_shape_check',
      sql`${t.status} = 'draft' or (
            ${t.number} is not null and ${t.invoiceDate} is not null
            and ${t.issuedAt} is not null and ${t.issuedBy} is not null
            and ${t.subtotal} is not null and ${t.taxTotal} is not null and ${t.total} is not null
            and ${t.sellerName} is not null and ${t.sellerLine1} is not null and ${t.sellerCountry} is not null
            and ${t.billToName} is not null and ${t.billToLine1} is not null and ${t.billToCountry} is not null
          )`,
    ),

    // All three or none, and only on a voided invoice — the shipment rule.
    check(
      'invoices_void_shape_check',
      sql`(${t.status} = 'voided') = (${t.voidedAt} is not null)
          and (${t.voidedAt} is null) = (${t.voidedBy} is null)
          and (${t.voidedAt} is null) = (${t.voidReason} is null)`,
    ),

    // The total is the sum of its parts. Stored three times, checked once.
    check(
      'invoices_total_check',
      sql`${t.total} is null or ${t.total} = ${t.subtotal} + ${t.taxTotal}`,
    ),

    check(
      'invoices_amounts_not_negative_check',
      sql`coalesce(${t.subtotal}, 0) >= 0 and coalesce(${t.taxTotal}, 0) >= 0`,
    ),

    check(
      'invoices_due_after_issue_check',
      sql`${t.dueDate} is null or ${t.invoiceDate} is null or ${t.dueDate} >= ${t.invoiceDate}`,
    ),

    check(
      'invoices_ship_to_snapshot_check',
      sql`(${t.shipToLine1} is null) = (${t.shipToCountry} is null)`,
    ),

    check(
      'invoices_countries_format_check',
      sql`(${t.sellerCountry} is null or ${t.sellerCountry} ~ '^[A-Z]{2}$')
          and (${t.billToCountry} is null or ${t.billToCountry} ~ '^[A-Z]{2}$')
          and (${t.shipToCountry} is null or ${t.shipToCountry} ~ '^[A-Z]{2}$')`,
    ),

    // Unique per organization. Drafts have no number, and nulls never clash.
    uniqueIndex('invoices_org_number_key').on(t.organizationId, t.number),

    /**
     * At most one standing invoice per shipment. Also answers "is this
     * shipment billed" for Void shipment and the not-yet-invoiced list.
     */
    uniqueIndex('invoices_shipment_standing_key')
      .on(t.shipmentId)
      .where(sql`${t.status} <> 'voided'`),

    // A customer's invoices, newest first.
    index('invoices_org_partner_date_idx').on(
      t.organizationId,
      t.partnerId,
      t.invoiceDate.desc(),
    ),

    // What is still a draft, what is issued.
    index('invoices_org_status_idx').on(t.organizationId, t.status),

    // An order's invoices, on its page.
    index('invoices_org_order_idx').on(t.organizationId, t.orderId),
  ],
);
