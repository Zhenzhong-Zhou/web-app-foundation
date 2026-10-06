import { defineMessages } from 'react-intl';

/**
 * Words the printed documents share, in the customer's languages through
 * DocumentText rather than the reader's (ADR-054).
 */
export const PRINTED = defineMessages({
  sku: { id: 'documents.sku', defaultMessage: 'SKU' },
  item: { id: 'documents.item', defaultMessage: 'Item' },
  quantity: { id: 'documents.quantity', defaultMessage: 'Quantity' },
  unitPrice: { id: 'documents.unitPrice', defaultMessage: 'Unit price' },
  tax: { id: 'documents.tax', defaultMessage: 'Tax' },
  amount: { id: 'documents.amount', defaultMessage: 'Amount' },
  subtotal: { id: 'documents.subtotal', defaultMessage: 'Subtotal' },
  from: { id: 'documents.from', defaultMessage: 'From' },
  billTo: { id: 'documents.billTo', defaultMessage: 'Bill to' },
  shippedTo: { id: 'documents.shippedTo', defaultMessage: 'Shipped to' },
  shipTo: { id: 'documents.shipTo', defaultMessage: 'Ship to' },
  lot: { id: 'documents.lot', defaultMessage: 'Lot' },
  expires: { id: 'documents.expires', defaultMessage: 'Expires' },
});
