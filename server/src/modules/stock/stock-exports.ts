import { type ExportColumn, inWords } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import { dayIn, todayIn } from '../../common/today';
import { UNIT_WORDS } from '../../common/units';
import type {
  MovementReason,
  ReorderRule,
  ReorderSource,
} from '../../database/schema';
import type { Translatable } from '../../i18n/translate';
import { t, translate } from '../../i18n/translate';
import type { ListMovementsDto } from './dto/list-movements.dto';
import type { LotRecipient } from './dto/lot-trace-response.dto';
import type { ReorderPointRow } from './dto/reorder-point-response.dto';
import type {
  StockCodeRow,
  StockLotRow,
} from './dto/stock-grouped-response.dto';
import type { Movement, MovementPeriod } from './dto/stock-response.dto';
import { itemName } from './item-name';
import type { MovementCard } from './movement-view';
import { REORDER_STATUS_WORDS } from './reorder-status';

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

/** Why stock moved, as the movements filter names it, in the reader's words. */
const REASON_WORDS: Record<MovementReason, Translatable> = {
  receipt: t({ id: 'stock.reason.receipt', defaultMessage: 'Receipt' }),
  shipment: t({ id: 'stock.reason.shipment', defaultMessage: 'Shipment' }),
  transfer: t({ id: 'stock.reason.transfer', defaultMessage: 'Transfer' }),
  adjustment: t({
    id: 'stock.reason.adjustment',
    defaultMessage: 'Adjustment',
  }),
  production: t({
    id: 'stock.reason.production',
    defaultMessage: 'Production',
  }),
  consumption: t({
    id: 'stock.reason.consumption',
    defaultMessage: 'Consumption',
  }),
  sample: t({ id: 'stock.reason.sample', defaultMessage: 'Sample' }),
  return: t({ id: 'stock.reason.return', defaultMessage: 'Return' }),
};

/** A stock card's first and last lines (88a), in its Reason column. */
const BALANCE_WORDS = {
  opening: t({
    id: 'exports.value.openingBalance',
    defaultMessage: 'Opening balance',
  }),
  closing: t({
    id: 'exports.value.closingBalance',
    defaultMessage: 'Closing balance',
  }),
};

/**
 * A line of Movements' export (ADR-093, 87a and 88a): a movement, or a
 * date range's opening or closing balance, its first line and its last.
 */
export type MovementLine =
  | { movement: Movement }
  | {
      total: 'opening' | 'closing';
      /** The range's first day, or its last up to today; null when open. */
      day: string | null;
      period: MovementPeriod;
    };

/**
 * The export's lines, oldest first (87a): with a range's opening and
 * closing where the list keeps a balance (88a), the opening first, the
 * closing last with the range's In and Out beside it.
 */
export function movementLines(
  movements: Movement[],
  period: MovementPeriod | null,
  range: Pick<ListMovementsDto, 'from' | 'until'>,
  timeZone: string,
): MovementLine[] {
  if (period?.opening === null || period?.opening === undefined) {
    return movements.map((movement) => ({ movement }));
  }
  const today = todayIn(timeZone);
  // The range's last day is the one before `until`, which it excludes.
  const lastDay = range.until
    ? dayIn(timeZone, new Date(Date.parse(range.until) - 1))
    : today;
  return [
    {
      total: 'opening',
      day: range.from ? dayIn(timeZone, range.from) : null,
      period,
    },
    ...movements.map((movement) => ({ movement })),
    {
      total: 'closing',
      day: lastDay < today ? lastDay : today,
      period,
    },
  ];
}

/**
 * Movements' export (ADR-057, amended by ADR-093's 87a and 88a): the
 * screen's columns and words, one value to a column. In, Out and Balance
 * for one code, In and Out for one code with a reason or for an order,
 * else Change, as the list reads (cardOf); each day the organization's,
 * year-month-day (ADR-072); From and To, each place by its whole path,
 * only for a reader who may see places, else no such columns (ADR-080;
 * 96a); For, the document, only as the reader may see it (55a).
 */
export function movementColumns(options: {
  card: MovementCard;
  places: boolean;
  timeZone: string;
}): ExportColumn<MovementLine>[] {
  const { card, places, timeZone } = options;
  const of =
    <T>(value: (movement: Movement) => T) =>
    (line: MovementLine) =>
      'movement' in line ? value(line.movement) : null;
  const IN = t({ id: 'exports.column.in', defaultMessage: 'In' });
  const OUT = t({ id: 'exports.column.out', defaultMessage: 'Out' });

  const quantities: ExportColumn<MovementLine>[] = card.inOut
    ? [
        {
          header: IN,
          value: (line) =>
            'movement' in line
              ? line.movement.quantityIn
              : line.total === 'closing'
                ? line.period.quantityIn
                : null,
        },
        {
          header: OUT,
          value: (line) =>
            'movement' in line
              ? line.movement.quantityOut
              : line.total === 'closing'
                ? line.period.quantityOut
                : null,
        },
        ...(card.balance
          ? [
              {
                header: t({
                  id: 'exports.column.balance',
                  defaultMessage: 'Balance',
                }),
                value: (line: MovementLine) =>
                  'movement' in line
                    ? line.movement.balance
                    : line.period[line.total],
              },
            ]
          : []),
      ]
    : [
        {
          // As the list's Change reads: what came in, what went out with
          // its minus, a move within neither, its quantity alone.
          header: t({ id: 'exports.column.change', defaultMessage: 'Change' }),
          value: of(
            (movement) =>
              movement.quantityIn ??
              (movement.quantityOut === null
                ? movement.quantity
                : `-${movement.quantityOut}`),
          ),
        },
      ];

  return [
    {
      header: t({ id: 'exports.column.when', defaultMessage: 'When' }),
      value: (line) =>
        'movement' in line
          ? dayIn(timeZone, line.movement.createdAt)
          : line.day,
    },
    { header: HEADERS.sku, value: of((movement) => movement.currentSku) },
    {
      header: HEADERS.item,
      value: of((movement) =>
        itemName(movement.productName, movement.variantName),
      ),
    },
    ...quantities,
    inWords(
      HEADERS.unit,
      UNIT_WORDS,
      of((movement) => movement.unitOfMeasure),
    ),
    {
      header: t({ id: 'exports.column.reason', defaultMessage: 'Reason' }),
      value: (line, locale) =>
        'movement' in line
          ? Object.hasOwn(REASON_WORDS, line.movement.reason)
            ? translate(
                REASON_WORDS[line.movement.reason as MovementReason],
                locale,
              )
            : line.movement.reason
          : translate(BALANCE_WORDS[line.total], locale),
    },
    ...(places
      ? [
          {
            header: t({ id: 'exports.column.from', defaultMessage: 'From' }),
            value: of((movement) =>
              placeInWords(
                movement.fromLocationPath,
                movement.fromLocationName,
                movement.fromLocationCode,
              ),
            ),
          },
          {
            header: t({ id: 'exports.column.to', defaultMessage: 'To' }),
            value: of((movement) =>
              placeInWords(
                movement.toLocationPath,
                movement.toLocationName,
                movement.toLocationCode,
              ),
            ),
          },
        ]
      : []),
    { header: HEADERS.lot, value: of((movement) => movement.lotCode) },
    { header: HEADERS.expiry, value: of((movement) => movement.lotExpiresAt) },
    {
      header: t({ id: 'exports.column.for', defaultMessage: 'For' }),
      value: of((movement) => movement.document?.number ?? null),
    },
    {
      header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
      value: of((movement) => movement.actorName),
    },
  ];
}

/**
 * A place as the screen names it (57a): the places above it, its
 * warehouse first, then its own name with its code, "Main warehouse ›
 * Zone A › Shelf A2 (A2)"; null for no place.
 */
function placeInWords(
  path: string[],
  name: string | null,
  code: string | null,
): string | null {
  if (name === null) return null;
  return [...path, code ? `${name} (${code})` : name].join(' › ');
}

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
