import { csvMoment } from '../../common/csv';
import { type ExportColumn, inWords } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { UNIT_WORDS } from '../../common/units';
import type { ReorderRule, ReorderSource } from '../../database/schema';
import type { Translatable } from '../../i18n/translate';
import { t, translate } from '../../i18n/translate';
import type { LotRecipient } from './dto/lot-trace-response.dto';
import type { ReorderPointRow } from './dto/reorder-point-response.dto';
import type {
  StockCodeRow,
  StockLotRow,
} from './dto/stock-grouped-response.dto';
import { REORDER_STATUS_WORDS } from './reorder-status';
import type { StockReadsService } from './stock-reads.service';

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

/** A unit in the reader's words, "each", « unité », 个 (#473's 29). */
function unitInWords<T extends { unitOfMeasure: string }>(): ExportColumn<T> {
  return inWords(HEADERS.unit, UNIT_WORDS, (row) => row.unitOfMeasure);
}

/**
 * A row per code's export (ADR-093): each code's figures as its row shows
 * them, from the one read, its status and unit in the screen's words in
 * the reader's language (#473's 29); at one place chosen, that place's
 * (review 56).
 */
export function stockCodeColumns(here: boolean): ExportColumn<StockCodeRow>[] {
  return [
    { header: HEADERS.sku, value: (row) => row.sku },
    { header: HEADERS.item, value: (row) => row.productName },
    { header: VARIANT, value: (row) => row.variantName },
    // At one place chosen, what is there, as the screen's headers say
    // (20a): On hand and Expires first here, Free and Held every place's,
    // and no Not usable, which the screen leaves out there.
    here
      ? {
          header: t({
            id: 'exports.column.onHandHere',
            defaultMessage: 'On hand here',
          }),
          value: (row) => row.here?.onHand ?? null,
        }
      : {
          header: t({ id: 'exports.column.onHand', defaultMessage: 'On hand' }),
          value: (row) => row.onHand,
        },
    ...(here
      ? []
      : [
          {
            header: t({
              id: 'exports.column.notUsable',
              defaultMessage: 'Not usable',
            }),
            value: (row: StockCodeRow) => row.notUsable,
          },
        ]),
    {
      header: here
        ? t({
            id: 'exports.column.freeEverywhere',
            defaultMessage: 'Free, every place',
          })
        : t({ id: 'exports.column.free', defaultMessage: 'Free' }),
      value: (row) => row.free,
    },
    {
      header: here
        ? t({
            id: 'exports.column.heldEverywhere',
            defaultMessage: 'Held, every place',
          })
        : t({ id: 'exports.column.held', defaultMessage: 'Held' }),
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
    here
      ? {
          header: t({
            id: 'exports.column.expiresFirstHere',
            defaultMessage: 'Expires first here',
          }),
          value: (row) => row.here?.expiresFirst ?? null,
        }
      : {
          header: t({
            id: 'exports.column.expiresFirst',
            defaultMessage: 'Expires first',
          }),
          value: (row) => row.expiresFirst,
        },
    unitInWords(),
  ];
}

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

/** Bought or made, as Reorder's rows and its dialog say it. */
const SOURCE_WORDS: Record<ReorderSource, Translatable> = {
  bought: t({ id: 'stock.source.bought', defaultMessage: 'Bought' }),
  made: t({ id: 'stock.source.made', defaultMessage: 'Made' }),
};

/** How much to order, each rule by its name in the dialog. */
const RULE_WORDS: Record<ReorderRule, Translatable> = {
  just_enough: t({
    id: 'stock.rule.justEnough',
    defaultMessage: 'Just enough',
  }),
  fixed: t({ id: 'stock.rule.fixed', defaultMessage: 'A fixed quantity' }),
  maximum: t({ id: 'stock.rule.maximum', defaultMessage: 'Up to a maximum' }),
};

/**
 * Reorder's export (ADR-085, ADR-057): each item with a point as the list
 * shows it, its status, bought or made, its rule and its unit in the
 * screen's words in the reader's language (ADR-093; #473's 29).
 */
export const REORDER_POINT_COLUMNS: ExportColumn<ReorderPointRow>[] = [
  { header: HEADERS.sku, value: (row) => row.sku },
  { header: HEADERS.item, value: (row) => row.productName },
  { header: VARIANT, value: (row) => row.variantName },
  inWords(HEADERS.status, REORDER_STATUS_WORDS, (row) => row.status),
  inWords(
    t({
      id: 'exports.column.boughtOrMade',
      defaultMessage: 'Bought or made',
    }),
    SOURCE_WORDS,
    (row) => row.source,
  ),
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
  inWords(
    t({
      id: 'exports.column.rule',
      defaultMessage: 'How much to order',
    }),
    RULE_WORDS,
    (row) => row.rule,
  ),
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
  unitInWords(),
];

/**
 * A lot's recall list, its trace's Who received it (ADR-044, amended;
 * #473's 17): each customer who received the lot or anything made from
 * it, the order, the lot, how much and the day it first left, in the
 * screen's words. A row with no recipient on record says so, as the
 * screen does.
 */
export const RECALL_COLUMNS: ExportColumn<LotRecipient>[] = [
  {
    header: t({ id: 'exports.column.who', defaultMessage: 'Who' }),
    value: (row, locale) =>
      row.partnerName ??
      translate(
        t({
          id: 'exports.value.noRecipient',
          defaultMessage: 'No recipient recorded',
        }),
        locale,
      ),
  },
  {
    header: t({ id: 'exports.column.order', defaultMessage: 'Order' }),
    value: (row, locale) =>
      row.orderNumber && row.isSampleOrder
        ? translate(
            t(
              {
                id: 'exports.value.sampleOrder',
                defaultMessage: '{reference} (sample)',
              },
              { reference: row.orderNumber },
            ),
            locale,
          )
        : row.orderNumber,
  },
  { header: HEADERS.lot, value: (row) => row.lotCode },
  { header: HEADERS.sku, value: (row) => row.sku },
  {
    header: t({ id: 'exports.column.shipped', defaultMessage: 'Shipped' }),
    value: (row) => row.shipped,
  },
  {
    header: t({ id: 'exports.column.sampled', defaultMessage: 'Sampled' }),
    value: (row) => row.sampled,
  },
  {
    header: t({ id: 'exports.column.returned', defaultMessage: 'Returned' }),
    value: (row) => row.returned,
  },
  { header: HEADERS.date, value: (row) => row.leftOn },
];
