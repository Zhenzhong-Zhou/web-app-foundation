import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { OrdersService } from './orders.service';

type OrderRow = Awaited<ReturnType<OrdersService['list']>>['entries'][number];

/**
 * The orders export (ADR-057). Quantities, not money: a line carries its
 * own currency, so an order can hold two, and one total would be wrong.
 */
export const ORDER_COLUMNS: ExportColumn<OrderRow>[] = [
  { header: HEADERS.reference, value: (row) => row.reference },
  {
    header: t({ id: 'exports.column.direction', defaultMessage: 'Direction' }),
    value: (row) => row.direction,
  },
  { header: HEADERS.status, value: (row) => row.status },
  { header: HEADERS.partner, value: (row) => row.partnerName },
  {
    header: t({
      id: 'exports.column.expectedDate',
      defaultMessage: 'Expected date',
    }),
    value: (row) => row.expectedAt,
  },
  {
    header: t({ id: 'exports.column.lines', defaultMessage: 'Lines' }),
    value: (row) => row.lineCount,
  },
  {
    header: t({
      id: 'exports.column.quantityOrdered',
      defaultMessage: 'Quantity ordered',
    }),
    value: (row) => row.quantityOrdered,
  },
  {
    header: t({
      id: 'exports.column.quantityFulfilled',
      defaultMessage: 'Quantity received or shipped',
    }),
    value: (row) => row.quantityFulfilled,
  },
  { header: HEADERS.created, value: (row) => toIso(row.createdAt) },
];

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
