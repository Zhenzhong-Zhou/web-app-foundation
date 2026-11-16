import { csvMoment } from '../../common/csv';
import { type ExportColumn, inWords } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { UNIT_WORDS } from '../../common/units';
import { t } from '../../i18n/translate';
import type { ReorderPointRow } from './dto/reorder-point-response.dto';
import type {
  StockCodeRow,
  StockLotRow,
} from './dto/stock-grouped-response.dto';
import { REORDER_STATUS_WORDS } from './reorder-status';
import type { StockReadsService } from './stock-reads.service';

type StockRow = Awaited<
  ReturnType<StockReadsService['list']>
>['entries'][number];
type MovementRow = Awaited<
  ReturnType<StockReadsService['listMovements']>
>['entries'][number];

/**
 * The variant's own name, in the inventory's, the movements' and the
 * reorder points'.
 */
const VARIANT = t({ id: 'exports.column.variant', defaultMessage: 'Variant' });

/** Coming, Position and the reorder point: Reorder's and Inventory's. */
const COMING = t({ id: 'exports.column.coming', defaultMessage: 'Coming' });
const POSITION = t({
  id: 'exports.column.position',
  defaultMessage: 'Position',
});
const REORDER_POINT = t({
  id: 'exports.column.reorderPoint',
  defaultMessage: 'Reorder point',
});

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

/** A unit in the reader's words, "each", « unité », 个 (#473's 29). */
function unitInWords<T extends { unitOfMeasure: string }>(): ExportColumn<T> {
  return inWords(HEADERS.unit, UNIT_WORDS, (row) => row.unitOfMeasure);
}

/**
 * A row per code's export (ADR-093): each code's figures as its row shows
 * them, from the one read, its status and unit in the screen's words in
 * the reader's language (#473's 29).
 */
export const STOCK_CODE_COLUMNS: ExportColumn<StockCodeRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
  {
    header: t({ id: 'exports.column.onHand', defaultMessage: 'On hand' }),
    value: (row) => row.onHand,
  },
  {
    header: t({ id: 'exports.column.notUsable', defaultMessage: 'Not usable' }),
    value: (row) => row.notUsable,
  },
  {
    header: t({ id: 'exports.column.free', defaultMessage: 'Free' }),
    value: (row) => row.free,
  },
  {
    header: t({ id: 'exports.column.held', defaultMessage: 'Held' }),
    value: (row) => row.held,
  },
  {
    header: t({ id: 'exports.column.short', defaultMessage: 'Short' }),
    value: (row) => row.short,
  },
  { header: COMING, value: (row) => row.coming },
  {
    header: t({
      id: 'exports.column.expectedDate',
      defaultMessage: 'Expected date',
    }),
    value: (row) => row.comingOn,
  },
  { header: POSITION, value: (row) => row.position },
  { header: REORDER_POINT, value: (row) => row.reorderPoint },
  inWords(HEADERS.status, REORDER_STATUS_WORDS, (row) => row.status),
  {
    header: t({
      id: 'exports.column.expiresFirst',
      defaultMessage: 'Expires first',
    }),
    value: (row) => row.expiresFirst,
  },
  unitInWords(),
];

/**
 * The Lot view's export (ADR-093): a row per lot at each place, its place
 * named only for a reader who may see places (ADR-080), its unit in the
 * reader's words.
 */
export const STOCK_LOT_COLUMNS: ExportColumn<StockLotRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
  { header: HEADERS.lot, value: (row) => row.lotCode },
  { header: HEADERS.expiry, value: (row) => row.lotExpiresAt },
  { header: HEADERS.location, value: (row) => row.locationName },
  { header: HEADERS.quantity, value: (row) => row.quantity },
  unitInWords(),
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
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
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
  // The person by name and email, as the audit log's export (ADR-063).
  {
    header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
    value: (row) => row.actorName,
  },
  {
    header: t({ id: 'exports.column.email', defaultMessage: 'Email' }),
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
  { header: COMING, value: (row) => row.coming },
  {
    header: t({
      id: 'exports.column.stillNeeded',
      defaultMessage: 'Still needed',
    }),
    value: (row) => row.stillNeeded,
  },
  { header: POSITION, value: (row) => row.position },
  { header: REORDER_POINT, value: (row) => row.reorderPoint },
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
