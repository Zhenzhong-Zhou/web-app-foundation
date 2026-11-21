import { asMoney, type ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { InvoicesService } from './invoices.service';

type InvoiceRow = Awaited<
  ReturnType<InvoicesService['list']>
>['entries'][number];
type CreditNoteRow = Awaited<
  ReturnType<InvoicesService['listCreditNotes']>
>['entries'][number];

/**
 * The invoices export (ADR-057): one row per invoice, amounts as data at
 * the invoice's currency's places (99a).
 */
export const INVOICE_COLUMNS: ExportColumn<InvoiceRow>[] = [
  { header: HEADERS.number, value: (row) => row.number },
  { header: HEADERS.status, value: (row) => row.status },
  {
    header: t({
      id: 'exports.column.invoiceDate',
      defaultMessage: 'Invoice date',
    }),
    value: (row) => row.invoiceDate,
  },
  {
    header: t({ id: 'exports.column.dueDate', defaultMessage: 'Due date' }),
    value: (row) => row.dueDate,
  },
  { header: HEADERS.partner, value: (row) => row.partnerName },
  // The order by our number (ADR-071), then the customer's reference.
  {
    header: t({ id: 'exports.column.order', defaultMessage: 'Order' }),
    value: (row) => row.orderNumber,
  },
  { header: HEADERS.reference, value: (row) => row.orderReference },
  { header: HEADERS.currency, value: (row) => row.currency },
  asMoney(
    HEADERS.subtotal,
    (row) => row.subtotal,
    (row) => row.currency,
  ),
  asMoney(
    HEADERS.tax,
    (row) => row.taxTotal,
    (row) => row.currency,
  ),
  asMoney(
    HEADERS.total,
    (row) => row.total,
    (row) => row.currency,
  ),
  asMoney(
    t({ id: 'exports.column.credited', defaultMessage: 'Credited' }),
    (row) => row.credited,
    (row) => row.currency,
  ),
  asMoney(
    t({ id: 'exports.column.net', defaultMessage: 'Net invoiced' }),
    (row) => row.net,
    (row) => row.currency,
  ),
];

/** The credit notes export (ADR-057), its total as the invoices'. */
export const CREDIT_NOTE_COLUMNS: ExportColumn<CreditNoteRow>[] = [
  { header: HEADERS.number, value: (row) => row.number },
  {
    header: t({ id: 'exports.column.invoice', defaultMessage: 'Invoice' }),
    value: (row) => row.invoiceNumber,
  },
  { header: HEADERS.partner, value: (row) => row.partnerName },
  {
    header: t({
      id: 'exports.column.creditDate',
      defaultMessage: 'Credit date',
    }),
    value: (row) => row.creditDate,
  },
  { header: HEADERS.currency, value: (row) => row.currency },
  asMoney(
    HEADERS.total,
    (row) => row.total,
    (row) => row.currency,
  ),
  {
    header: t({
      id: 'exports.column.voidsInvoice',
      defaultMessage: 'Voids the invoice',
    }),
    value: (row) => row.isVoid,
  },
];
