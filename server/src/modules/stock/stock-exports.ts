import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { StockReadsService } from './stock-reads.service';

type StockRow = Awaited<
  ReturnType<StockReadsService['list']>
>['entries'][number];
type MovementRow = Awaited<
  ReturnType<StockReadsService['listMovements']>
>['entries'][number];

/**
 * The inventory export (ADR-057): what is on hand and where. Costs are the
 * stock value export's, beside the valuation they come from.
 */
export const STOCK_COLUMNS: ExportColumn<StockRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  {
    header: t({ id: 'exports.column.variant', defaultMessage: 'Variant' }),
    value: (row) => row.variantName,
  },
  { header: HEADERS.lot, value: (row) => row.lotCode },
  { header: HEADERS.expiry, value: (row) => row.lotExpiresAt },
  { header: HEADERS.location, value: (row) => row.locationName },
  { header: HEADERS.quantity, value: (row) => row.quantity },
  { header: HEADERS.unit, value: (row) => row.unitOfMeasure },
];

/** The movements export (ADR-057): the ledger, as recorded. */
export const MOVEMENT_COLUMNS: ExportColumn<MovementRow>[] = [
  {
    header: t({ id: 'exports.column.when', defaultMessage: 'When' }),
    value: (row) => toIso(row.createdAt),
  },
  {
    header: t({ id: 'exports.column.reason', defaultMessage: 'Reason' }),
    value: (row) => row.reason,
  },
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.lot, value: (row) => row.lotCode },
  { header: HEADERS.quantity, value: (row) => row.quantity },
  {
    header: t({ id: 'exports.column.from', defaultMessage: 'From' }),
    value: (row) => row.fromLocationName,
  },
  {
    header: t({ id: 'exports.column.to', defaultMessage: 'To' }),
    value: (row) => row.toLocationName,
  },
  {
    header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
    value: (row) => row.actorEmail,
  },
  {
    header: t({ id: 'exports.column.note', defaultMessage: 'Note' }),
    value: (row) => row.note,
  },
];

function toIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}
