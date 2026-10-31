import { csvMoment } from '../../common/csv';
import type { ExportColumn } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { t } from '../../i18n/translate';
import type { ReorderPointRow } from './dto/reorder-point-response.dto';
import type { StockReadsService } from './stock-reads.service';

type StockRow = Awaited<
  ReturnType<StockReadsService['list']>
>['entries'][number];
type MovementRow = Awaited<
  ReturnType<StockReadsService['listMovements']>
>['entries'][number];

/** The variant's own name, in the inventory's and the reorder points'. */
const VARIANT = t({ id: 'exports.column.variant', defaultMessage: 'Variant' });

/**
 * The inventory export (ADR-057): what is on hand and where. Costs are the
 * stock value export's, beside the valuation they come from.
 */
export const STOCK_COLUMNS: ExportColumn<StockRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
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
    value: (row) => csvMoment(row.createdAt),
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

/**
 * The reorder points export (ADR-085, ADR-057): each item with a point as
 * the list shows it, its status, source and rule as stored.
 */
export const REORDER_POINT_COLUMNS: ExportColumn<ReorderPointRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
  { header: HEADERS.status, value: (row) => row.status },
  {
    header: t({
      id: 'exports.column.boughtOrMade',
      defaultMessage: 'Bought or made',
    }),
    value: (row) => row.source,
  },
  {
    header: t({ id: 'exports.column.usable', defaultMessage: 'Usable' }),
    value: (row) => row.usable,
  },
  {
    header: t({ id: 'exports.column.coming', defaultMessage: 'Coming' }),
    value: (row) => row.coming,
  },
  {
    header: t({
      id: 'exports.column.stillNeeded',
      defaultMessage: 'Still needed',
    }),
    value: (row) => row.stillNeeded,
  },
  {
    header: t({ id: 'exports.column.position', defaultMessage: 'Position' }),
    value: (row) => row.position,
  },
  {
    header: t({
      id: 'exports.column.reorderPoint',
      defaultMessage: 'Reorder point',
    }),
    value: (row) => row.reorderPoint,
  },
  {
    header: t({
      id: 'exports.column.rule',
      defaultMessage: 'How much to order',
    }),
    value: (row) => row.rule,
  },
  {
    header: t({
      id: 'exports.column.fixedQuantity',
      defaultMessage: 'Fixed quantity',
    }),
    value: (row) => row.fixedQuantity,
  },
  {
    header: t({ id: 'exports.column.maximum', defaultMessage: 'Maximum' }),
    value: (row) => row.maximumQuantity,
  },
  {
    header: t({ id: 'exports.column.inDraft', defaultMessage: 'In draft' }),
    value: (row) => row.inDraft,
  },
  {
    header: t({
      id: 'exports.column.suggestedOrder',
      defaultMessage: 'Suggested order',
    }),
    value: (row) => row.suggestion,
  },
  { header: HEADERS.unit, value: (row) => row.unitOfMeasure },
];
