import { char, text, uuid } from 'drizzle-orm/pg-core';

import { addresses } from './addresses';

/**
 * Snapshot columns shared by invoices and credit notes (ADR-046).
 *
 * Not a table. Functions rather than objects, because Drizzle needs a fresh
 * column builder per table; spreading one shared object into two tables
 * would bind the same builders twice.
 *
 * Every column is nullable here, because an invoice fills them only at
 * issue. Each table's own checks say which must be present once it is
 * issued.
 *
 * Copied, never joined: `addresses` and `organizations` hold what is true
 * now, and these hold what was printed that day — the reasoning of the
 * order's ship-to columns (ADR-028).
 */

/** Who issued the document: name, registered address, tax number. */
export const sellerSnapshot = () => ({
  sellerName: text('seller_name'),
  /** Printed because invoices over a threshold must show it in many places. */
  sellerTaxNumber: text('seller_tax_number'),
  sellerLine1: text('seller_line1'),
  sellerLine2: text('seller_line2'),
  sellerCity: text('seller_city'),
  sellerRegion: text('seller_region'),
  sellerPostalCode: text('seller_postal_code'),
  sellerCountry: char('seller_country', { length: 2 }),
});

/** Who is billed: the customer's name and billing address. */
export const billToSnapshot = () => ({
  /**
   * Provenance only — which address was chosen. Never read to display an
   * issued document. No action on delete, for the order's reason: addresses
   * retire rather than delete.
   */
  billToAddressId: uuid('bill_to_address_id').references(() => addresses.id, {
    onDelete: 'no action',
  }),
  billToName: text('bill_to_name'),
  billToLine1: text('bill_to_line1'),
  billToLine2: text('bill_to_line2'),
  billToCity: text('bill_to_city'),
  billToRegion: text('bill_to_region'),
  billToPostalCode: text('bill_to_postal_code'),
  billToCountry: char('bill_to_country', { length: 2 }),
});
