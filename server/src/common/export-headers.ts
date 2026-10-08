import { t } from '../i18n/translate';

/**
 * The column headers every export shares (ADR-057), each once, so "Partner"
 * reads the same in every file and is translated once. An export takes the
 * ones it needs; a header only one export has lives beside that export.
 */
export const HEADERS = {
  number: t({ id: 'exports.column.number', defaultMessage: 'Number' }),
  status: t({ id: 'exports.column.status', defaultMessage: 'Status' }),
  partner: t({ id: 'exports.column.partner', defaultMessage: 'Partner' }),
  currency: t({ id: 'exports.column.currency', defaultMessage: 'Currency' }),
  subtotal: t({
    id: 'exports.column.subtotal',
    defaultMessage: 'Subtotal before tax',
  }),
  tax: t({ id: 'exports.column.tax', defaultMessage: 'Tax' }),
  total: t({ id: 'exports.column.total', defaultMessage: 'Total' }),
  date: t({ id: 'exports.column.date', defaultMessage: 'Date' }),
  sku: t({ id: 'exports.column.sku', defaultMessage: 'SKU' }),
  item: t({ id: 'exports.column.item', defaultMessage: 'Item' }),
  lot: t({ id: 'exports.column.lot', defaultMessage: 'Lot' }),
  expiry: t({ id: 'exports.column.expiry', defaultMessage: 'Expiry' }),
  location: t({ id: 'exports.column.location', defaultMessage: 'Location' }),
  quantity: t({ id: 'exports.column.quantity', defaultMessage: 'Quantity' }),
  unit: t({ id: 'exports.column.unit', defaultMessage: 'Unit' }),
  reference: t({ id: 'exports.column.reference', defaultMessage: 'Reference' }),
  created: t({ id: 'exports.column.created', defaultMessage: 'Created' }),
} as const;
