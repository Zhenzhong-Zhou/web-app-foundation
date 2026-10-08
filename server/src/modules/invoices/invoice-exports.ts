import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { InvoicesService } from './invoices.service';

type InvoiceRow = Awaited<
  ReturnType<InvoicesService['list']>
>['entries'][number];
type CreditNoteRow = Awaited<
  ReturnType<InvoicesService['listCreditNotes']>
>['entries'][number];

/** The invoices export (ADR-057): one row per invoice, amounts as data. */
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
  {
    header: t({ id: 'exports.column.order', defaultMessage: 'Order' }),
    value: (row) => row.orderReference,
  },
  { header: HEADERS.currency, value: (row) => row.currency },
  { header: HEADERS.subtotal, value: (row) => row.subtotal },
  { header: HEADERS.tax, value: (row) => row.taxTotal },
  { header: HEADERS.total, value: (row) => row.total },
  {
    header: t({ id: 'exports.column.credited', defaultMessage: 'Credited' }),
    value: (row) => row.credited,
  },
  {
    header: t({ id: 'exports.column.net', defaultMessage: 'Net invoiced' }),
    value: (row) => row.net,
  },
];

/** The credit notes export (ADR-057). */
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
  { header: HEADERS.total, value: (row) => row.total },
  {
    header: t({
      id: 'exports.column.voidsInvoice',
      defaultMessage: 'Voids the invoice',
    }),
    value: (row) => row.isVoid,
  },
];
