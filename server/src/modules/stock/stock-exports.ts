import { asQuantity, type ExportColumn, inWords } from '../../common/export';
import { HEADERS } from '../../common/export-headers';
import type { Locale } from '../../common/locales';
import { MOVEMENT_REASON_WORDS } from '../../common/movement-reasons';
import { dayIn, momentIn, todayIn, zonePlaceIn } from '../../common/today';
import { UNIT_WORDS } from '../../common/units';
import type { ReorderRule, ReorderSource } from '../../database/schema';
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

/** Coming, Left and the reorder point: Reorder's and Inventory's. */
const COMING = t({ id: 'exports.column.coming', defaultMessage: 'Coming' });
const POSITION = t({
  id: 'exports.column.position',
  defaultMessage: 'Left',
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
      ? asQuantity(
          t({
            id: 'exports.column.onHandHere',
            defaultMessage: 'On hand here',
          }),
          (row) => row.here?.onHand,
        )
      : asQuantity(
          t({ id: 'exports.column.onHand', defaultMessage: 'On hand' }),
          (row) => row.onHand,
        ),
    ...(here
      ? []
      : [
          asQuantity(
            t({
              id: 'exports.column.notUsable',
              defaultMessage: 'Not usable',
            }),
            (row: StockCodeRow) => row.notUsable,
          ),
        ]),
    asQuantity(
      here
        ? t({
            id: 'exports.column.freeEverywhere',
            defaultMessage: 'Free, every place',
          })
        : t({ id: 'exports.column.free', defaultMessage: 'Free' }),
      (row) => row.free,
    ),
    asQuantity(
      here
        ? t({
            id: 'exports.column.heldEverywhere',
            defaultMessage: 'Held, every place',
          })
        : t({ id: 'exports.column.held', defaultMessage: 'Held' }),
      (row) => row.held,
    ),
    asQuantity(
      t({ id: 'exports.column.short', defaultMessage: 'Short' }),
      (row) => row.short,
    ),
    asQuantity(COMING, (row) => row.coming),
    {
      header: t({
        id: 'exports.column.expectedDate',
        defaultMessage: 'Expected date',
      }),
      value: (row) => row.comingOn,
    },
    asQuantity(POSITION, (row) => row.position),
    asQuantity(REORDER_POINT, (row) => row.reorderPoint),
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
  asQuantity(HEADERS.quantity, (row) => row.quantity),
  unitInWords(),
];

/**
 * What a correction says it was, chosen when the count is corrected, as
 * the screen says it after the reason; any other detail is written as
 * recorded, free text under its reason (ADR-023).
 */
const DETAIL_WORDS: Record<string, Translatable> = {
  miscount: t({ id: 'stock.detail.miscount', defaultMessage: 'miscount' }),
  damaged: t({ id: 'stock.detail.damaged', defaultMessage: 'damaged' }),
  expired: t({ id: 'stock.detail.expired', defaultMessage: 'expired' }),
  lost: t({ id: 'stock.detail.lost', defaultMessage: 'lost' }),
  found: t({ id: 'stock.detail.found', defaultMessage: 'found' }),
};

/**
 * An end outside the warehouse, as the screen's From → to says it in grey
 * (ADR-093, 82a), so an export's From or To is never blank there.
 */
const OUTSIDE_WORDS = {
  supplier: t({ id: 'stock.end.supplier', defaultMessage: 'supplier' }),
  customer: t({ id: 'stock.end.customer', defaultMessage: 'customer' }),
  run: t({ id: 'stock.end.run', defaultMessage: 'run' }),
  sample: t({ id: 'stock.end.sample', defaultMessage: 'sample' }),
  countedIn: t({ id: 'stock.end.countedIn', defaultMessage: 'counted in' }),
  countedOut: t({
    id: 'stock.end.countedOut',
    defaultMessage: 'counted out',
  }),
};

/**
 * Where a movement with no place at one end came from or went to, by its
 * reason, as the screen's `outsideEnd` reads it (ADR-023): a receipt from
 * a supplier, a return or a voided shipment from a customer, a run's
 * output from the run, a correction counted in; a shipment to a customer,
 * a run's use to the run, a sample to "sample" (125), a correction
 * counted out.
 */
function outsideEnd(
  movement: Movement,
  side: 'from' | 'to',
): keyof typeof OUTSIDE_WORDS | null {
  if (side === 'from' ? movement.fromLocationId : movement.toLocationId) {
    return null;
  }
  switch (movement.reason) {
    case 'receipt':
      return 'supplier';
    case 'shipment':
    case 'return':
      return 'customer';
    case 'production':
    case 'consumption':
      return 'run';
    case 'sample':
      return 'sample';
    case 'adjustment':
      return side === 'from' ? 'countedIn' : 'countedOut';
    default:
      return null;
  }
}

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
 * A move between two places counted in neither In nor Out, as one code
 * across every place reads it (85a): its quantity is the Moved column's
 * (118a, 114).
 */
function movedInNeither(movement: Movement): boolean {
  return (
    movement.reason === 'transfer' &&
    movement.quantityIn === null &&
    movement.quantityOut === null
  );
}

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
 * screen's columns and words, one value to a column. When to the second
 * on the organization's clocks, its header naming the place its zone is
 * named for, "When (Vancouver time)", in Chinese by ICU's name for it,
 * "时间（温哥华时间）" (98a, 134b; ADR-072), a range's opening
 * and closing their days; beside Code, the code a row was recorded under
 * where it differs from today's, as the row's "was" (116); In, Out and
 * Balance for one code, In and Out for one code with a reason or for an
 * order, else Change, as the list reads (cardOf), the stock card's
 * Moved between Out and Balance, a move counted in neither's quantity
 * (118a, 114); From and To, each place
 * by its whole path, only for a reader who may see places, else no such
 * columns (ADR-080; 96a); For, the document, or a sample's recipient by
 * name, only as the reader may see it (55a; 125); By with the person's email (ADR-063); the note last, as
 * typed (review 54).
 */
export function movementColumns(options: {
  card: MovementCard;
  places: boolean;
  timeZone: string;
  /** The reader's, for the place When's header names. */
  locale: Locale;
}): ExportColumn<MovementLine>[] {
  const { card, places, timeZone, locale } = options;
  const of =
    <T>(value: (movement: Movement) => T) =>
    (line: MovementLine) =>
      'movement' in line ? value(line.movement) : null;
  const IN = t({ id: 'exports.column.in', defaultMessage: 'In' });
  const OUT = t({ id: 'exports.column.out', defaultMessage: 'Out' });
  const REASON = t({ id: 'exports.column.reason', defaultMessage: 'Reason' });
  // The reason and a correction's detail in the screen's words, a code
  // with no word written as recorded (inWords).
  const reasonOf = inWords(
    REASON,
    MOVEMENT_REASON_WORDS,
    of((movement) => movement.reason),
  );
  const detailOf = inWords(
    REASON,
    DETAIL_WORDS,
    of((movement) => movement.reasonDetail),
  );
  // From or To: the place by its whole path, or an end outside the
  // warehouse in the screen's words, never blank there (82a).
  const endColumn = (
    header: Translatable,
    side: 'from' | 'to',
  ): ExportColumn<MovementLine> => {
    const outside = inWords(
      header,
      OUTSIDE_WORDS,
      of((movement) => outsideEnd(movement, side)),
    );
    const place = of((movement) => placeInWords(movement, side));
    return {
      header,
      value: (line, locale) => place(line) ?? outside.value(line, locale),
    };
  };

  const quantities: ExportColumn<MovementLine>[] = card.inOut
    ? [
        asQuantity(IN, (line) =>
          'movement' in line
            ? line.movement.quantityIn
            : line.total === 'closing'
              ? line.period.quantityIn
              : null,
        ),
        asQuantity(OUT, (line) =>
          'movement' in line
            ? line.movement.quantityOut
            : line.total === 'closing'
              ? line.period.quantityOut
              : null,
        ),
        ...(card.balance
          ? [
              // A move across every place, counted in neither In nor
              // Out, says how many moved here alone (118a, 114).
              asQuantity(
                t({ id: 'exports.column.moved', defaultMessage: 'Moved' }),
                of((movement) =>
                  movedInNeither(movement) ? movement.quantity : null,
                ),
              ),
              asQuantity(
                t({
                  id: 'exports.column.balance',
                  defaultMessage: 'Balance',
                }),
                (line: MovementLine) =>
                  'movement' in line
                    ? line.movement.balance
                    : line.period[line.total],
              ),
            ]
          : []),
      ]
    : [
        // The list's Change, the server's one sign (review 24): what came
        // in, what went out with its minus, a move counted as neither its
        // quantity alone.
        asQuantity(
          t({ id: 'exports.column.change', defaultMessage: 'Change' }),
          of((movement) => movement.change ?? movement.quantity),
        ),
      ];

  return [
    {
      header: t(
        { id: 'exports.column.whenIn', defaultMessage: 'When ({city} time)' },
        { city: zonePlaceIn(timeZone, locale) },
      ),
      value: (line) =>
        'movement' in line
          ? momentIn(timeZone, line.movement.createdAt)
          : line.day,
    },
    { header: HEADERS.sku, value: of((movement) => movement.currentSku) },
    {
      header: t({
        id: 'exports.column.recordedAs',
        defaultMessage: 'Recorded as',
      }),
      value: of((movement) =>
        movement.sku === movement.currentSku ? null : movement.sku,
      ),
    },
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
      header: REASON,
      value: (line, locale) => {
        if (!('movement' in line)) {
          return translate(BALANCE_WORDS[line.total], locale);
        }
        const reason = reasonOf.value(line, locale);
        const detail = detailOf.value(line, locale);
        // As the screen writes it, "Corrected: found" (100a).
        return detail
          ? translate(
              t(
                {
                  id: 'stock.reasonDetail',
                  defaultMessage: '{reason}: {detail}',
                },
                { reason: String(reason), detail: String(detail) },
              ),
              locale,
            )
          : reason;
      },
    },
    ...(places
      ? [
          endColumn(
            t({ id: 'exports.column.from', defaultMessage: 'From' }),
            'from',
          ),
          endColumn(t({ id: 'exports.column.to', defaultMessage: 'To' }), 'to'),
        ]
      : []),
    { header: HEADERS.lot, value: of((movement) => movement.lotCode) },
    { header: HEADERS.expiry, value: of((movement) => movement.lotExpiresAt) },
    {
      header: t({ id: 'exports.column.for', defaultMessage: 'For' }),
      value: of(
        (movement) =>
          movement.document?.number ?? movement.recipient?.name ?? null,
      ),
    },
    {
      header: t({ id: 'exports.column.by', defaultMessage: 'By' }),
      value: of((movement) => movement.actorName),
    },
    {
      header: t({ id: 'exports.column.email', defaultMessage: 'Email' }),
      value: of((movement) => movement.actorEmail),
    },
    {
      header: t({ id: 'exports.column.note', defaultMessage: 'Note' }),
      value: of((movement) => movement.note),
    },
  ];
}

/**
 * A movement's end as the screen names its place (57a): the places above
 * it, its warehouse first, then its own name with its code, "Main
 * warehouse › Zone A › Shelf A2 (A2)"; null for no place.
 */
function placeInWords(movement: Movement, side: 'from' | 'to'): string | null {
  const [path, name, code] =
    side === 'from'
      ? [
          movement.fromLocationPath,
          movement.fromLocationName,
          movement.fromLocationCode,
        ]
      : [
          movement.toLocationPath,
          movement.toLocationName,
          movement.toLocationCode,
        ];
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
  asQuantity(
    t({ id: 'exports.column.usable', defaultMessage: 'Usable' }),
    (row) => row.usable,
  ),
  asQuantity(COMING, (row) => row.coming),
  asQuantity(
    t({
      id: 'exports.column.stillNeeded',
      defaultMessage: 'Still needed',
    }),
    (row) => row.stillNeeded,
  ),
  asQuantity(POSITION, (row) => row.position),
  asQuantity(REORDER_POINT, (row) => row.reorderPoint),
  inWords(
    t({
      id: 'exports.column.rule',
      defaultMessage: 'How much to order',
    }),
    RULE_WORDS,
    (row) => row.rule,
  ),
  asQuantity(
    t({
      id: 'exports.column.fixedQuantity',
      defaultMessage: 'Fixed quantity',
    }),
    (row) => row.fixedQuantity,
  ),
  asQuantity(
    t({ id: 'exports.column.maximum', defaultMessage: 'Maximum' }),
    (row) => row.maximumQuantity,
  ),
  asQuantity(
    t({ id: 'exports.column.inDraft', defaultMessage: 'In draft' }),
    (row) => row.inDraft,
  ),
  asQuantity(
    t({
      id: 'exports.column.suggestedOrder',
      defaultMessage: 'Suggested order',
    }),
    (row) => row.suggestion,
  ),
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
  asQuantity(
    t({ id: 'exports.column.shipped', defaultMessage: 'Shipped' }),
    (row) => row.shipped,
  ),
  asQuantity(
    t({ id: 'exports.column.sampled', defaultMessage: 'Sampled' }),
    (row) => row.sampled,
  ),
  asQuantity(
    t({ id: 'exports.column.returned', defaultMessage: 'Returned' }),
    (row) => row.returned,
  ),
  { header: HEADERS.date, value: (row) => row.leftOn },
];
