import {
  Box,
  Button,
  Link,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  type MouseEvent,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import type {
  Location,
  StockCodePlaces,
  StockCodeRow,
  StockPlace,
} from '../api/types.gen';
import { ActionsHeader } from '../components/actions-header';
import { type Action, ActionsMenu } from '../components/actions-menu';
import { CardLine } from '../components/card-line';
import { ExpiryChip } from '../components/expiry-chip';
import { ListTable } from '../components/list-table';
import { LotLink } from '../components/lot-link';
import { NUMBER_COLUMN } from '../components/number-column';
import { OpeningButton } from '../components/opening-button';
import { PlaceholderRows } from '../components/placeholder-rows';
import { SortHeader } from '../components/sort-header';
import { SPANNING_ROW } from '../components/spanning-row';
import { TableOrCards } from '../components/table-or-cards';
import { api, withQuery } from '../lib/api';
import type { StockCodeSort } from '../lib/api-names';
import { isZero } from '../lib/decimal';
import { displayQuantity, formatDay, itemName, NO_VALUE } from '../lib/format';
import { whereItStands } from '../lib/item-path';
import { OFFER_BACK } from '../lib/offer-back';
import type { SortOrder } from '../lib/use-list-sort';
import { useOpenRows } from '../lib/use-open-rows';
import { NameAndCode } from '../products/name-and-code';
import { displayWithUnit } from '../products/units';
import { WIDE_ONLY } from '../theme/media';
import type { CountInItem } from './count-in-dialog';
import { EmptiedLine } from './emptied-line';
import { useMenuWords } from './menu-words';
import type { MoveMode } from './move-stock-dialog';
import { movementsPath } from './movements-path';
import { notUsableWhy } from './not-usable';
import { PlacePath } from './place-path';
import { PlacesHidden } from './places-hidden';
import type { ReorderItem } from './reorder-point-dialog';
import { LeftLine, ReorderStatusChip } from './reorder-status';
import { type Pile, StockActions } from './stock-actions';
import { openKey, placeName } from './stock-places';

/**
 * Where the item's name starts in its cell: the cell's 16 px, the cover's
 * 40 and NameAndCode's 12 px gap. A place's path under it starts there
 * too (57a).
 */
const UNDER_THE_NAME = 2 + (40 + 12) / 8;

/** What a row's menus do, as the Stock tab answers them. */
export interface StockHandlers {
  canMove: boolean;
  canAdjust: boolean;
  canReorder: boolean;
  onMove: (mode: MoveMode, row: Pile) => void;
  /**
   * Left for the item's page, or for Movements from the code's row, a
   * place or a lot: Back returns focus to the code's row.
   */
  onLeave: (variantId: string) => void;
  onEditLot: (row: Pile) => void;
  onReorder: (item: ReorderItem) => void;
  /** Receive stock, the dialog with this item filled in (ADR-093 v3). */
  onReceive: (variantId: string) => void;
  /**
   * Count it in…: Correct the count for stock found where the item has
   * never been, a place and a lot to choose (ADR-093, R26).
   */
  onCountIn: (item: CountInItem) => void;
}

type Header = (column: StockCodeSort) => {
  active: boolean;
  order: SortOrder;
  onSort: () => void;
};

/** The words of its headers and figures. */
const HEADS = defineMessages({
  item: { id: 'inventory.item', defaultMessage: 'Item' },
  lotsHere: { id: 'inventory.stock.lotsHere', defaultMessage: 'Lots here' },
  where: { id: 'inventory.stock.where', defaultMessage: 'Where' },
  onHandHere: {
    id: 'inventory.stock.onHandHere',
    defaultMessage: 'On hand here',
  },
  onHand: { id: 'common.onHand', defaultMessage: 'On hand' },
  freeEverywhere: {
    id: 'inventory.stock.freeEverywhere',
    defaultMessage: 'Free, every place',
  },
  free: { id: 'inventory.stock.free', defaultMessage: 'Free' },
  heldEverywhere: {
    id: 'inventory.stock.heldEverywhere',
    defaultMessage: 'Held, every place',
  },
  held: { id: 'inventory.stock.held', defaultMessage: 'Held' },
  coming: { id: 'inventory.stock.coming', defaultMessage: 'Coming' },
  status: { id: 'inventory.stock.status', defaultMessage: 'Status' },
  expiresFirstHere: {
    id: 'inventory.stock.expiresFirstHere',
    defaultMessage: 'Expires first here',
  },
  expiresFirst: {
    id: 'inventory.stock.expiresFirst',
    defaultMessage: 'Expires first',
  },
  noneOnHand: {
    id: 'inventory.stock.noneOnHand',
    defaultMessage: 'None on hand',
  },
});

/**
 * Held's and Coming's places in a row under a code: two empty cells, gone
 * between 600 and 899 px with their headers, so no row spans a column the
 * head does not show there (R14).
 */
function WideOnlyCells() {
  return (
    <>
      <TableCell sx={WIDE_ONLY} />
      <TableCell sx={WIDE_ONLY} />
    </>
  );
}

/**
 * A row per code (ADR-093, R1 and R2): the name and its code, where it
 * is, On hand with what is not usable, Free with what is short, Held,
 * Coming with its day, the status with the line it judges, what expires
 * first, and one Actions button; a table from 600 px and cards below it.
 * At one place chosen, On hand and Expires first are what is there, Free
 * and Held the whole item's (20a).
 */
export function StockCodes({
  rows,
  loading,
  seesPlaces,
  place,
  includeEmpty,
  header,
  handlers,
  changes,
  opens,
  onOpen,
  focusRow,
}: {
  rows: StockCodeRow[] | null;
  loading: boolean;
  seesPlaces: boolean;
  place: Location | null;
  includeEmpty: boolean;
  header: Header;
  handlers: StockHandlers;
  /** Bumped when stock changed, so an opened row reads its places again. */
  changes: number;
} & Returning) {
  const intl = useIntl();
  const opened = {
    seesPlaces,
    place,
    includeEmpty,
    handlers,
    changes,
    opens,
    onOpen,
    focusRow,
  };

  return (
    <TableOrCards
      loading={loading}
      table={
        <ListTable
          label={intl.formatMessage({
            id: 'inventory.tab.stock',
            defaultMessage: 'Stock',
          })}
          size="small"
        >
          <TableHead>
            <TableRow>
              <SortHeader
                name
                label={intl.formatMessage(HEADS.item)}
                {...header('name')}
                atRest
              />
              <TableCell>
                {place
                  ? intl.formatMessage(HEADS.lotsHere)
                  : intl.formatMessage(HEADS.where)}
              </TableCell>
              <SortHeader
                number
                label={
                  place
                    ? intl.formatMessage(HEADS.onHandHere)
                    : intl.formatMessage(HEADS.onHand)
                }
                {...header('onHand')}
                atRest
              />
              <TableCell {...NUMBER_COLUMN}>
                {place
                  ? intl.formatMessage(HEADS.freeEverywhere)
                  : intl.formatMessage(HEADS.free)}
              </TableCell>
              <TableCell {...NUMBER_COLUMN} sx={WIDE_ONLY}>
                {place
                  ? intl.formatMessage(HEADS.heldEverywhere)
                  : intl.formatMessage(HEADS.held)}
              </TableCell>
              <TableCell {...NUMBER_COLUMN} sx={WIDE_ONLY}>
                {intl.formatMessage(HEADS.coming)}
              </TableCell>
              <TableCell>{intl.formatMessage(HEADS.status)}</TableCell>
              <SortHeader
                label={
                  place
                    ? intl.formatMessage(HEADS.expiresFirstHere)
                    : intl.formatMessage(HEADS.expiresFirst)
                }
                {...header('expires')}
                atRest
              />
              {/* Every header named (R6), this one to a screen reader:
                  each row's button says its word. */}
              <ActionsHeader padding="checkbox" />
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <PlaceholderRows columns={9} wideOnly={2} />}
            {rows?.map((row) => (
              <CodeTableRow key={row.variantId} row={row} {...opened} />
            ))}
          </TableBody>
        </ListTable>
      }
      cards={
        <Stack component="ul" sx={{ m: 0, p: 0 }}>
          {rows?.map((row) => (
            <CodeCard key={row.variantId} row={row} {...opened} />
          ))}
        </Stack>
      }
    />
  );
}

/**
 * The rows the address names open, `?open=`, and the row Back returns
 * focus to (ADR-093's Stock table: Back, Stock as it was, focus on that
 * row, the rows open).
 */
interface Returning {
  /** The codes whose rows are open, and the places whose lots are (openKey). */
  opens: string[];
  onOpen: (key: string, open: boolean) => void;
  /** The code whose name takes focus once its row is drawn. */
  focusRow: string | null;
}

interface Opened extends Returning {
  seesPlaces: boolean;
  place: Location | null;
  includeEmpty: boolean;
  handlers: StockHandlers;
  changes: number;
}

/** A code's places and their lots, at the place chosen if one is. */
function readPlaces(
  row: StockCodeRow,
  { place, includeEmpty }: Opened,
  /** The emptied piles too, to correct a count with nothing on hand. */
  emptied = false,
): Promise<StockPlace[]> {
  return api<StockCodePlaces>(
    withQuery(`/stock/by-code/${row.variantId}/places`, {
      locationId: place?.id,
      includeEmpty: includeEmpty || emptied ? 'true' : undefined,
    }),
  ).then((answer) => answer.places);
}

/** A code's places and their lots, read as its row opens (R2). */
function usePlaces(row: StockCodeRow, opened: Opened, emptied = false) {
  return useOpenRows(
    () => readPlaces(row, opened, emptied),
    opened.changes,
    opened.opens.includes(row.variantId),
  );
}

/**
 * The row's name, focused when Back returns to the row it was left from;
 * and what keeps that row as left from: a click on a link to its item.
 */
function useReturn(row: StockCodeRow, { focusRow, handlers }: Opened) {
  const name = useRef<HTMLAnchorElement>(null);
  const returned = focusRow === row.variantId;
  useEffect(() => {
    if (returned) name.current?.focus();
  }, [returned]);

  const leaving = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest('a');
    if (link?.getAttribute('href')?.startsWith('/items/')) {
      handlers.onLeave(row.variantId);
    }
  };

  return { name, leaving };
}

/**
 * Whether the code is one pile where the row stands, one lot at one place:
 * then Move and the rest act on it straight, with no lot to choose.
 */
function onePile(row: StockCodeRow, { place }: Opened): boolean {
  if (place) return (row.here?.lots ?? 0) <= 1;
  return row.places === 1 && row.lots <= 1;
}

/** On hand where the row stands: at the place chosen, or every place's. */
function onHandOf(row: StockCodeRow, { place }: Opened): string {
  return place ? (row.here?.onHand ?? '0') : row.onHand;
}

/**
 * What the row does with a pile's action chosen from the code's own
 * Actions: on its one pile straight; otherwise the row opens to its lots,
 * "Choose the lot" said above them and focus on the first lot's Actions.
 */
function usePileChoice(
  row: StockCodeRow,
  opened: Opened,
  places: ReturnType<typeof usePlaces>,
  setEmptied: (emptied: boolean) => void,
) {
  /** The action the lots were opened to choose for, "Choose the lot to move". */
  const [choosing, setChoosing] = useState<MoveMode | null>(null);
  const first = useRef<HTMLButtonElement>(null);

  // Focus on the first lot's Actions once the lots are drawn.
  const drawn = places.open && places.rows !== null;
  useEffect(() => {
    if (choosing && drawn) first.current?.focus();
  }, [choosing, drawn]);
  /** The row's own button: closed, it no longer asks for a lot. */
  function toggle() {
    if (places.open) {
      setChoosing(null);
      setEmptied(false);
    }
    opened.onOpen(row.variantId, !places.open);
    places.toggle();
  }

  async function act(mode: MoveMode) {
    // Nothing on hand: Correct the count opens the emptied places and lots
    // to choose one (ADR-093 v3).
    const emptied = mode === 'adjust' && isZero(onHandOf(row, opened));
    if (!emptied && onePile(row, opened)) {
      try {
        const rows = places.rows ?? (await readPlaces(row, opened));
        const pile = rows.flatMap((each) => each.lots)[0];
        if (pile) {
          opened.handlers.onMove(mode, pile);
          return;
        }
      } catch {
        // Its places could not be read: the row opens, which says so with
        // Try again.
      }
    }
    setChoosing(mode);
    setEmptied(emptied);
    if (!places.open) {
      opened.onOpen(row.variantId, true);
      places.toggle();
    } else if (emptied) {
      places.retry();
    }
  }

  return { choosing, first, act, toggle };
}

/** What the row's button opens: "2 places", or "2 lots" without places. */
function openWords(
  row: StockCodeRow,
  { seesPlaces, place }: Opened,
  intl: ReturnType<typeof useIntl>,
): string | null {
  const lots = place ? (row.here?.lots ?? 0) : row.lots;
  if (seesPlaces && !place) {
    return row.places > 0
      ? intl.formatMessage(
          {
            id: 'inventory.stock.places',
            defaultMessage: '{count, plural, one {# place} other {# places}}',
          },
          { count: row.places },
        )
      : null;
  }
  if (lots > 0) {
    return intl.formatMessage(
      {
        id: 'inventory.stock.lots',
        defaultMessage: '{count, plural, one {# lot} other {# lots}}',
      },
      { count: lots },
    );
  }
  // Not tracked by lot, in several places a reader without places may not
  // name: how many, each opened by its quantity alone (A6).
  return !place && row.places > 1
    ? intl.formatMessage(
        {
          id: 'inventory.stock.places',
          defaultMessage: '{count, plural, one {# place} other {# places}}',
        },
        { count: row.places },
      )
    : null;
}

/**
 * Where nothing opens: "None on hand" when there is none, otherwise a dash,
 * as for a code not tracked by lot at the one place chosen.
 */
function NothingToOpen({ row, ...opened }: { row: StockCodeRow } & Opened) {
  const intl = useIntl();

  if (!isZero(onHandOf(row, opened))) return NO_VALUE;
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {intl.formatMessage(HEADS.noneOnHand)}
    </Typography>
  );
}

/** A code's row in the table, and the rows it opens to after it. */
function CodeTableRow({ row, ...opened }: { row: StockCodeRow } & Opened) {
  const intl = useIntl();
  // Opened to correct a count with nothing on hand: the emptied piles too.
  const [emptied, setEmptied] = useState(false);
  const places = usePlaces(row, opened, emptied);
  const choice = usePileChoice(row, opened, places, setEmptied);
  const back = useReturn(row, opened);
  const controls = useId();
  const words = openWords(row, opened, intl);
  const name = itemName(row.productName, row.variantName);

  return (
    <>
      {/* The name is the row's one way in (ADR-093 v3): the row tints under
          the pointer, which stays an arrow. */}
      <TableRow hover onClickCapture={back.leaving}>
        <TableCell>
          <NameAndCode
            name={name}
            code={row.sku}
            withType
            type={row.type}
            coverFileId={row.coverFileId}
            to={`/items/${row.productId}`}
            linkRef={back.name}
          />
        </TableCell>
        <TableCell>
          {words ? (
            <OpeningButton
              words={words}
              name={openName(words, name, intl)}
              open={places.open}
              busy={places.busy}
              controls={controls}
              onClick={choice.toggle}
            />
          ) : (
            <NothingToOpen row={row} {...opened} />
          )}
        </TableCell>
        <TableCell align="right">
          <OnHand row={row} here={!!opened.place} />
        </TableCell>
        <TableCell align="right">
          <Free row={row} />
        </TableCell>
        <TableCell align="right" sx={WIDE_ONLY}>
          {isZero(row.held)
            ? NO_VALUE
            : displayWithUnit(row.held, row.unitOfMeasure, intl)}
        </TableCell>
        <TableCell align="right" sx={WIDE_ONLY}>
          <Coming row={row} />
        </TableCell>
        <TableCell>
          <Status row={row} />
        </TableCell>
        <TableCell>
          <ExpiresFirst row={row} here={!!opened.place} />
        </TableCell>
        <TableCell padding="checkbox">
          <CodeActions row={row} opened={opened} onPile={choice.act} />
        </TableCell>
      </TableRow>

      {places.open && (
        <PlacesRows
          id={controls}
          row={row}
          places={places.rows}
          failure={places.failure}
          onRetry={places.retry}
          choosing={choice.choosing}
          first={choice.first}
          {...opened}
        />
      )}
    </>
  );
}

/**
 * The button's name, its words first so it holds what it shows (WCAG
 * 2.5.3): "2 places: show where Vitamin C is", "… hide …" when open.
 */
function openName(
  words: string,
  name: string,
  intl: ReturnType<typeof useIntl>,
): { show: string; hide: string } {
  return {
    show: intl.formatMessage(
      {
        id: 'inventory.stock.showWhere',
        defaultMessage: '{words}: show where {name} is',
      },
      { words, name },
    ),
    hide: intl.formatMessage(
      {
        id: 'inventory.stock.hideWhere',
        defaultMessage: '{words}: hide where {name} is',
      },
      { words, name },
    ),
  };
}

/**
 * On hand, and its not-usable part under it (R1); on a phone's card, with
 * why, since the card has no other column to say it (#612).
 */
function OnHand({
  row,
  here,
  why = false,
}: {
  row: StockCodeRow;
  here: boolean;
  why?: boolean;
}) {
  const intl = useIntl();
  const onHand = here ? (row.here?.onHand ?? '0') : row.onHand;

  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(onHand, row.unitOfMeasure, intl)}</span>
      {!here && !isZero(row.notUsable) && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {why
            ? notUsableWhy(row, intl)
            : intl.formatMessage(
                {
                  id: 'inventory.stock.notUsable',
                  defaultMessage: '{quantity} not usable',
                },
                { quantity: displayQuantity(row.notUsable) },
              )}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * Free, and what confirmed orders want beyond it, a link to Held (16a); on
 * a phone's card, what is held under it too, the rest of why Free is less
 * than On hand (#612).
 */
function Free({ row, held = false }: { row: StockCodeRow; held?: boolean }) {
  const intl = useIntl();

  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(row.free, row.unitOfMeasure, intl)}</span>
      {held && !isZero(row.held) && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.stock.heldUnder',
              defaultMessage: '{quantity} held',
            },
            { quantity: displayQuantity(row.held) },
          )}
        </Typography>
      )}
      {!isZero(row.short) && (
        <Link
          component={RouterLink}
          to={whereItStands(row.productId, 'held')}
          state={OFFER_BACK}
          variant="body2"
          sx={{ color: 'error.main', fontWeight: 600 }}
        >
          {intl.formatMessage(
            { id: 'inventory.stock.short', defaultMessage: '{quantity} short' },
            { quantity: displayQuantity(row.short) },
          )}
        </Link>
      )}
    </Stack>
  );
}

/**
 * The soonest expiry of the usable stock, at a place that place's; where
 * every unit on hand has expired, "all expired", since "—" read as nothing
 * to expire (#611): as the server says it, an expired lot at a place not
 * available counted too, which `expired` leaves out (review 13).
 */
function ExpiresFirst({ row, here }: { row: StockCodeRow; here: boolean }) {
  const intl = useIntl();
  const expiresAt = here ? (row.here?.expiresFirst ?? null) : row.expiresFirst;

  if (!here && row.allExpired) {
    return (
      <Typography variant="body2" sx={{ color: 'error.main' }}>
        {intl.formatMessage({
          id: 'inventory.stock.allExpired',
          defaultMessage: 'all expired',
        })}
      </Typography>
    );
  }
  return <ExpiryChip expiresAt={expiresAt} />;
}

/** Coming, with its soonest day; a run has none. */
function Coming({ row }: { row: StockCodeRow }) {
  const intl = useIntl();

  if (isZero(row.coming)) return NO_VALUE;
  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(row.coming, row.unitOfMeasure, intl)}</span>
      {row.comingOn && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {formatDay(row.comingOn)}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * The status in Home's words, and under it the line it judges, "10 left ·
 * reorder at 36", a link to Where it stands (the design language's
 * Numbers). None without a reorder point.
 */
function Status({ row }: { row: StockCodeRow }) {
  if (!row.status || row.reorderPoint === null) return NO_VALUE;
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <ReorderStatusChip status={row.status} />
      <LeftLine
        position={row.position}
        reorderPoint={row.reorderPoint}
        productId={row.productId}
      />
    </Stack>
  );
}

/**
 * A code's one Actions button: its Movements, filtered to the code
 * (ADR-093, R11), and its reorder point by permission. A lot's own
 * actions are on its row.
 */
function CodeActions({
  row,
  opened,
  onPile,
}: {
  row: StockCodeRow;
  opened: Opened;
  /** A pile's action chosen from the code's row (usePileChoice). */
  onPile: (mode: MoveMode) => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  const words = useMenuWords();
  const { handlers } = opened;
  const nothing = isZero(onHandOf(row, opened));
  const reason = (doing: 'move' | 'ship' | 'send') =>
    nothing
      ? intl.formatMessage(
          {
            id: 'inventory.menu.nothingOnHand',
            defaultMessage:
              '{doing, select, move {Nothing on hand to move} ship {Nothing on hand to ship} other {Nothing on hand to send}}',
          },
          { doing },
        )
      : undefined;

  // What changes stock, each on its one lot at its one place, or on the
  // lot chosen next; greyed with its reason when nothing is on hand,
  // Correct the count kept to correct an emptied place or lot, greyed for
  // an item never stocked here (ADR-093 v3).
  const changes: Action[] = handlers.canMove
    ? [
        {
          label: words.move,
          onSelect: () => onPile('transfer'),
          unavailable: reason('move'),
        },
        {
          label: words.ship,
          onSelect: () => onPile('ship'),
          unavailable: reason('ship'),
        },
        {
          label: words.sample,
          onSelect: () => onPile('sample'),
          unavailable: reason('send'),
        },
        ...(handlers.canAdjust
          ? [
              {
                label: words.correct,
                onSelect: () => onPile('adjust'),
                unavailable: row.stocked
                  ? undefined
                  : intl.formatMessage({
                      id: 'inventory.menu.neverStocked',
                      defaultMessage: 'Never stocked here: receive it first',
                    }),
              },
            ]
          : []),
      ]
    : [];
  const receive: Action[] = handlers.canMove
    ? [
        {
          label: words.receive,
          onSelect: () => handlers.onReceive(row.variantId),
        },
      ]
    : [];
  const reads: Action[] = [
    {
      label: words.movements,
      onSelect: () => {
        handlers.onLeave(row.variantId);
        void navigate(movementsPath({ variantId: row.variantId }), {
          state: OFFER_BACK,
        });
      },
    },
    // The item's, not a lot's: one point across every place (ADR-085).
    ...(handlers.canReorder
      ? [
          {
            label:
              row.reorderPoint === null ? words.setPoint : words.changePoint,
            onSelect: () => handlers.onReorder(row),
          },
        ]
      : []),
  ];

  return (
    <ActionsMenu
      name={intl.formatMessage(
        { id: 'inventory.actions.item', defaultMessage: 'Actions for {item}' },
        { item: itemName(row.productName, row.variantName) },
      )}
      groups={[changes, receive, reads]}
      note={
        handlers.canMove && !nothing && !onePile(row, opened)
          ? choiceNote(row, opened, intl)
          : undefined
      }
    />
  );
}

/**
 * Above an item's choices when it is more than one lot at one place: what
 * comes next, "3 lots in 2 places: you choose the lot next" (ADR-093 v3).
 */
function choiceNote(
  row: StockCodeRow,
  { place }: Opened,
  intl: ReturnType<typeof useIntl>,
): string {
  const lots = place ? (row.here?.lots ?? 0) : row.lots;
  if (lots === 0) {
    return intl.formatMessage(
      {
        id: 'inventory.menu.placesNext',
        defaultMessage:
          '{places, plural, one {In # place} other {In # places}}: you choose the place next',
      },
      { places: row.places },
    );
  }
  return place
    ? intl.formatMessage(
        {
          id: 'inventory.menu.lotsHereNext',
          defaultMessage:
            '{lots, plural, one {# lot} other {# lots}} here: you choose the lot next',
        },
        { lots },
      )
    : intl.formatMessage(
        {
          id: 'inventory.menu.lotsNext',
          defaultMessage:
            '{lots, plural, one {# lot} other {# lots}} in {places, plural, one {# place} other {# places}}: you choose the lot next',
        },
        { lots, places: row.places },
      );
}

/**
 * "Choose the lot to move", above the lots a pile's action from the item's
 * row opened to; "Choose the place to move" for one not tracked by lot
 * (ADR-093 v3).
 */
function ChooseLine({
  places,
  mode,
}: {
  places: StockPlace[];
  mode: MoveMode;
}) {
  const intl = useIntl();
  const tracked = places.some((each) =>
    each.lots.some((lot) => lot.lotId !== null),
  );

  return (
    <Typography role="status" variant="body2" sx={{ fontWeight: 600 }}>
      {tracked
        ? intl.formatMessage(
            {
              id: 'inventory.stock.chooseLotTo',
              defaultMessage:
                '{mode, select, transfer {Choose the lot to move} ship {Choose the lot to ship} sample {Choose the lot to send} other {Choose the lot to correct}}',
            },
            { mode },
          )
        : intl.formatMessage(
            {
              id: 'inventory.stock.choosePlaceTo',
              defaultMessage:
                '{mode, select, transfer {Choose the place to move} ship {Choose the place to ship} sample {Choose the place to send} other {Choose the place to correct}}',
            },
            { mode },
          )}
    </Typography>
  );
}

/**
 * What a code's row opens to (R2): each place, with its lots behind its
 * own button, soonest first; for a reader without places, the lots
 * straight, never a place's name (A6). "Reading…" is on the button; a
 * failure is said here with Try again (the partial state).
 */
function PlacesRows({
  id,
  row,
  places,
  failure,
  onRetry,
  choosing,
  first,
  seesPlaces,
  place,
  handlers,
  opens,
  onOpen,
}: {
  id: string;
  row: StockCodeRow;
  places: StockPlace[] | null;
  failure: unknown;
  onRetry: () => void;
  /** Opened by a pile's action from the item's row: "Choose the lot to …". */
  choosing: MoveMode | null;
  /** The first lot's Actions, which focus moves to while choosing. */
  first: RefObject<HTMLButtonElement | null>;
} & Opened) {
  const intl = useIntl();

  if (failure) {
    return (
      <TableRow id={id} {...SPANNING_ROW}>
        <TableCell colSpan={7}>
          <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
            <Typography variant="body2" sx={{ color: 'error.main' }}>
              {intl.formatMessage({
                id: 'inventory.stock.placesFailed',
                defaultMessage: 'Its places could not be read.',
              })}
            </Typography>
            <Button variant="text" onClick={onRetry}>
              {intl.formatMessage({
                id: 'common.tryAgain',
                defaultMessage: 'Try again',
              })}
            </Button>
          </Stack>
        </TableCell>
        <WideOnlyCells />
      </TableRow>
    );
  }
  if (!places) return <TableRow id={id} />;

  const line = choosing && (
    <TableRow sx={{ bgcolor: 'action.hover' }} {...SPANNING_ROW}>
      <TableCell colSpan={7} sx={{ pl: UNDER_THE_NAME }}>
        <ChooseLine places={places} mode={choosing} />
      </TableCell>
      <WideOnlyCells />
    </TableRow>
  );

  const found = offersFound(handlers, seesPlaces, choosing) && (
    <TableRow sx={{ bgcolor: 'action.hover' }} {...SPANNING_ROW}>
      <TableCell colSpan={7} sx={{ pl: UNDER_THE_NAME }}>
        <FoundLine row={row} places={places} handlers={handlers} />
      </TableCell>
      <WideOnlyCells />
    </TableRow>
  );

  // Without places, or at the one chosen: the lots alone, each at a place
  // not available saying so, never which place (A6).
  if (!seesPlaces || place) {
    const lots = places.flatMap((each) =>
      each.lots.map((lot) => ({ lot, usable: each.isAvailable })),
    );
    // A code not tracked by lot, in places the reader may not name: why,
    // not a row of "—" for each (review 3, 115); a pile's action still
    // opens them to choose from.
    if (!place && !choosing && lots.every(({ lot }) => lot.lotId === null)) {
      return (
        <TableRow id={id} {...SPANNING_ROW}>
          <TableCell colSpan={7} sx={{ pl: UNDER_THE_NAME }}>
            <PlacesHidden />
          </TableCell>
          <WideOnlyCells />
        </TableRow>
      );
    }
    return (
      <>
        {line}
        {lots.map(({ lot, usable }, index) => (
          <LotTableRow
            key={lot.id}
            id={index === 0 ? id : undefined}
            lot={lot}
            row={row}
            handlers={handlers}
            depth={1}
            notAvailable={!usable}
            actionsRef={index === 0 ? first : undefined}
          />
        ))}
        {found}
      </>
    );
  }

  return (
    <>
      {line}
      {places.map((each, index) => (
        <PlaceTableRow
          key={each.locationId}
          id={index === 0 ? id : undefined}
          row={row}
          place={each}
          handlers={handlers}
          lotsOpen={!!choosing}
          opened={opens.includes(openKey(row.variantId, each.locationId))}
          onOpen={(open) =>
            onOpen(openKey(row.variantId, each.locationId), open)
          }
          actionsRef={index === 0 ? first : undefined}
        />
      ))}
      {found}
    </>
  );
}

/**
 * Whether a code's opened places end with Count it in…: for whoever may
 * correct counts and see places, and not while a lot is chosen to move,
 * ship or send.
 */
function offersFound(
  handlers: StockHandlers,
  seesPlaces: boolean,
  choosing: MoveMode | null,
): boolean {
  return (
    handlers.canMove &&
    handlers.canAdjust &&
    seesPlaces &&
    (choosing === null || choosing === 'adjust')
  );
}

/**
 * "Found some where it has never been?" and Count it in…, ending a
 * code's opened places and lots (ADR-093, R26, 84a): Correct the count
 * with a place and, for an item tracked by lot, a lot to choose.
 */
function FoundLine({
  row,
  places,
  handlers,
}: {
  row: StockCodeRow;
  places: StockPlace[];
  handlers: StockHandlers;
}) {
  const intl = useIntl();
  const tracksLots = places.some((each) =>
    each.lots.some((lot) => lot.lotId !== null),
  );

  return (
    <Stack
      direction="row"
      spacing={1}
      useFlexGap
      sx={{ alignItems: 'center', flexWrap: 'wrap' }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {intl.formatMessage({
          id: 'inventory.stock.foundElsewhere',
          defaultMessage: 'Found some where it has never been?',
        })}
      </Typography>
      <Button
        variant="text"
        onClick={() =>
          handlers.onCountIn({
            variantId: row.variantId,
            sku: row.sku,
            unitOfMeasure: row.unitOfMeasure,
            tracksLots,
          })
        }
      >
        {intl.formatMessage({
          id: 'inventory.stock.countIn',
          defaultMessage: 'Count it in…',
        })}
      </Button>
    </Stack>
  );
}

/**
 * A place's row: its name, why it is not usable, its lots behind a
 * button, open as the address says, so Back finds them open (R11).
 */
function PlaceTableRow({
  id,
  row,
  place,
  handlers,
  lotsOpen,
  opened,
  onOpen,
  actionsRef,
}: {
  id?: string;
  row: StockCodeRow;
  place: StockPlace;
  handlers: StockHandlers;
  /** Its lots shown from the start: a lot is being chosen. */
  lotsOpen: boolean;
  /** Its lots open in the address, `?open=`. */
  opened: boolean;
  onOpen: (open: boolean) => void;
  /** Its first lot's Actions, or its own for a code not tracked by lot. */
  actionsRef?: RefObject<HTMLButtonElement | null>;
}) {
  const intl = useIntl();
  const lotsId = useId();
  // Its lots came with it, so opening reads nothing.
  const [open, setOpen] = useState(lotsOpen || opened);
  // A lot asked for opens them, as React adjusts state to a prop.
  const [asked, setAsked] = useState(lotsOpen);
  if (lotsOpen !== asked) {
    setAsked(lotsOpen);
    if (lotsOpen) setOpen(true);
  }
  const tracked = place.lots.some((lot) => lot.lotId !== null);
  const where = placeName(place);
  const words = intl.formatMessage(
    {
      id: 'inventory.stock.lots',
      defaultMessage: '{count, plural, one {# lot} other {# lots}}',
    },
    { count: place.lots.length },
  );

  return (
    <>
      <TableRow id={id} sx={{ bgcolor: 'action.hover' }}>
        <TableCell sx={{ pl: UNDER_THE_NAME }}>
          <Stack sx={{ minWidth: 0 }}>
            <PlacePath place={place} />
            {!place.isAvailable && <NotUsableHere />}
          </Stack>
        </TableCell>
        <TableCell>
          {tracked && (
            <OpeningButton
              words={words}
              name={{
                show: intl.formatMessage(
                  {
                    id: 'inventory.stock.showLots',
                    defaultMessage: '{words}: show the lots at {place}',
                  },
                  { words, place: where },
                ),
                hide: intl.formatMessage(
                  {
                    id: 'inventory.stock.hideLots',
                    defaultMessage: '{words}: hide the lots at {place}',
                  },
                  { words, place: where },
                ),
              }}
              open={open}
              busy={false}
              controls={lotsId}
              onClick={() => {
                setOpen(!open);
                onOpen(!open);
              }}
            />
          )}
        </TableCell>
        <TableCell align="right">
          {displayWithUnit(place.onHand, row.unitOfMeasure, intl)}
        </TableCell>
        {/* Free, Held, Coming, then Status and Expires first: a cell for
            each the head shows at this width (R14). */}
        <TableCell />
        <WideOnlyCells />
        <TableCell colSpan={2} />
        <TableCell padding="checkbox">
          {/* Not tracked by lot: the place's one pile is the row. Tracked:
              the code's Movements at this place, a plain link. */}
          {!tracked && place.lots[0] ? (
            <PileActions
              pile={place.lots[0]}
              handlers={handlers}
              buttonRef={actionsRef}
            />
          ) : (
            <PlaceMovements row={row} place={place} handlers={handlers} />
          )}
        </TableCell>
      </TableRow>
      {tracked &&
        open &&
        place.lots.map((lot, index) => (
          <LotTableRow
            key={lot.id}
            id={index === 0 ? lotsId : undefined}
            lot={lot}
            row={row}
            handlers={handlers}
            depth={2}
            actionsRef={index === 0 ? actionsRef : undefined}
          />
        ))}
    </>
  );
}

/** "Not usable: not available", in the critical tone (ADR-093). */
function NotUsableHere() {
  const intl = useIntl();
  return (
    <Typography variant="body2" sx={{ color: 'error.main' }}>
      {intl.formatMessage({
        id: 'inventory.stock.notAvailable',
        defaultMessage: 'Not usable: a place not available',
      })}
    </Typography>
  );
}

/**
 * A place's own link, its Movements there: a plain link in words, not a
 * menu of one (ADR-093 v3), opening Movements filtered to the code at
 * that place (R11).
 */
function PlaceMovements({
  row,
  place,
  handlers,
}: {
  row: StockCodeRow;
  place: StockPlace;
  handlers: StockHandlers;
}) {
  const intl = useIntl();
  const where = placeName(place);

  return (
    <Link
      component={RouterLink}
      to={movementsPath({
        variantId: row.variantId,
        locationId: place.locationId,
      })}
      state={OFFER_BACK}
      variant="body2"
      underline="always"
      aria-label={intl.formatMessage(
        {
          id: 'inventory.stock.movementsAt',
          defaultMessage: 'Movements of {item} at {place}',
        },
        { item: itemName(row.productName, row.variantName), place: where },
      )}
      onClick={() => handlers.onLeave(row.variantId)}
      sx={{ whiteSpace: 'nowrap', px: 1 }}
    >
      {intl.formatMessage({
        id: 'layout.nav.movements',
        defaultMessage: 'Movements',
      })}
    </Link>
  );
}

/** A lot's row under its place: its code a link, its quantity and expiry. */
function LotTableRow({
  id,
  lot,
  row,
  handlers,
  depth,
  notAvailable = false,
  actionsRef,
}: {
  id?: string;
  lot: Pile;
  row: StockCodeRow;
  handlers: StockHandlers;
  depth: number;
  /** At a place not available, its name not shown (A6). */
  notAvailable?: boolean;
  /** The first lot's Actions, which focus moves to while choosing. */
  actionsRef?: RefObject<HTMLButtonElement | null>;
}) {
  const intl = useIntl();

  return (
    <TableRow id={id} sx={{ bgcolor: 'action.hover' }}>
      {/* Under the item's name, and a step further under a place. */}
      <TableCell sx={{ pl: UNDER_THE_NAME + (depth - 1) * 3 }}>
        {lot.lotId && lot.lotCode ? (
          <Stack direction="row" spacing={1} sx={{ alignItems: 'baseline' }}>
            <span>
              {intl.formatMessage({
                id: 'inventory.lot',
                defaultMessage: 'Lot',
              })}
            </span>
            <LotLink id={lot.lotId} code={lot.lotCode} />
          </Stack>
        ) : (
          NO_VALUE
        )}
        <EmptiedLine pile={lot} />
        {notAvailable && <NotUsableHere />}
      </TableCell>
      <TableCell />
      <TableCell align="right">
        {displayWithUnit(lot.quantity, row.unitOfMeasure, intl)}
      </TableCell>
      {/* Free, Held, Coming and Status, as the head shows them. */}
      <TableCell />
      <WideOnlyCells />
      <TableCell />
      <TableCell>
        <ExpiryChip expiresAt={lot.lotExpiresAt} />
      </TableCell>
      <TableCell padding="checkbox">
        <PileActions pile={lot} handlers={handlers} buttonRef={actionsRef} />
      </TableCell>
    </TableRow>
  );
}

/** A pile's own menu: Move, Ship out, Edit lot and the rest, by permission. */
export function PileActions({
  pile,
  handlers,
  buttonRef,
}: {
  pile: Pile;
  handlers: StockHandlers;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <StockActions
      row={pile}
      canMove={handlers.canMove}
      canAdjust={handlers.canAdjust}
      onSelect={handlers.onMove}
      onLeave={handlers.onLeave}
      onEditLot={handlers.onEditLot}
      buttonRef={buttonRef}
    />
  );
}

/**
 * A code as a card below 600 px (the design language's Lists on a phone):
 * the name, its status and the two figures that matter most, On hand and
 * Free; opened, Held and Coming first, then where it is.
 */
function CodeCard({ row, ...opened }: { row: StockCodeRow } & Opened) {
  const intl = useIntl();
  // Opened to correct a count with nothing on hand: the emptied piles too.
  const [emptied, setEmptied] = useState(false);
  const places = usePlaces(row, opened, emptied);
  const choice = usePileChoice(row, opened, places, setEmptied);
  const back = useReturn(row, opened);
  const controls = useId();
  const words = openWords(row, opened, intl);
  const name = itemName(row.productName, row.variantName);

  return (
    <Box
      component="li"
      onClickCapture={back.leaving}
      sx={{
        listStyle: 'none',
        p: 2,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Stack spacing={1}>
        <NameAndCode
          name={name}
          code={row.sku}
          withType
          type={row.type}
          coverFileId={row.coverFileId}
          to={`/items/${row.productId}`}
          linkRef={back.name}
        />
        <Status row={row} />
        <CardLine label={intl.formatMessage(HEADS.onHand)}>
          <OnHand row={row} here={!!opened.place} why />
        </CardLine>
        <CardLine label={intl.formatMessage(HEADS.free)}>
          <Free row={row} held />
        </CardLine>
        <CardLine label={intl.formatMessage(HEADS.expiresFirst)}>
          <ExpiresFirst row={row} here={!!opened.place} />
        </CardLine>
        <Stack
          direction="row"
          spacing={1}
          useFlexGap
          sx={{ alignItems: 'center', flexWrap: 'wrap' }}
        >
          {words ? (
            <OpeningButton
              words={words}
              name={openName(words, name, intl)}
              open={places.open}
              busy={places.busy}
              controls={controls}
              onClick={choice.toggle}
            />
          ) : (
            <NothingToOpen row={row} {...opened} />
          )}
          <Box sx={{ flex: 1 }} />
          <CodeActions row={row} opened={opened} onPile={choice.act} />
        </Stack>
        {places.open && (
          <Stack id={controls} spacing={1}>
            <CardLine label={intl.formatMessage(HEADS.held)}>
              {displayWithUnit(row.held, row.unitOfMeasure, intl)}
            </CardLine>
            <CardLine label={intl.formatMessage(HEADS.coming)}>
              <Coming row={row} />
            </CardLine>
            {choice.choosing && places.rows && (
              <ChooseLine places={places.rows} mode={choice.choosing} />
            )}
            <OpenedCard
              row={row}
              places={places.rows}
              failure={places.failure}
              onRetry={places.retry}
              first={choice.first}
              {...opened}
            />
            {places.rows &&
              offersFound(
                opened.handlers,
                opened.seesPlaces,
                choice.choosing,
              ) && (
                <FoundLine
                  row={row}
                  places={places.rows}
                  handlers={opened.handlers}
                />
              )}
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** A card's places and lots, opened. */
function OpenedCard({
  row,
  places,
  failure,
  onRetry,
  first,
  seesPlaces,
  place,
  handlers,
}: {
  row: StockCodeRow;
  places: StockPlace[] | null;
  failure: unknown;
  onRetry: () => void;
  /** The first lot's Actions, which focus moves to while choosing. */
  first: RefObject<HTMLButtonElement | null>;
} & Opened) {
  const intl = useIntl();

  if (failure) {
    return (
      <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
        <Typography variant="body2" sx={{ color: 'error.main' }}>
          {intl.formatMessage({
            id: 'inventory.stock.placesFailed',
            defaultMessage: 'Its places could not be read.',
          })}
        </Typography>
        <Button variant="text" onClick={onRetry}>
          {intl.formatMessage({
            id: 'common.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      </Stack>
    );
  }
  if (!places) return null;

  const showPlaces = seesPlaces && !place;
  const firstPile = places[0]?.lots[0]?.id;
  return (
    <Stack component="ul" spacing={1} sx={{ m: 0, p: 0 }}>
      {places.map((each) => (
        <Box component="li" key={each.locationId} sx={{ listStyle: 'none' }}>
          {showPlaces && (
            <Stack
              direction="row"
              spacing={1}
              sx={{ justifyContent: 'space-between' }}
            >
              <Stack sx={{ minWidth: 0 }}>
                <Typography component="div" sx={{ fontWeight: 600 }}>
                  <PlacePath place={each} />
                </Typography>
                {!each.isAvailable && <NotUsableHere />}
              </Stack>
              <span>
                {displayWithUnit(each.onHand, row.unitOfMeasure, intl)}
              </span>
            </Stack>
          )}
          {each.lots.map((lot) => (
            <Stack
              key={lot.id}
              direction="row"
              spacing={1}
              useFlexGap
              sx={{
                alignItems: 'center',
                flexWrap: 'wrap',
                pl: showPlaces ? 2 : 0,
              }}
            >
              {/* The lot keeps room to be read; its quantity and Actions go
                  under it where all three do not fit (R14). */}
              <Stack sx={{ flex: '1 1 10rem', minWidth: 0 }}>
                {lot.lotId && lot.lotCode && (
                  <LotLink id={lot.lotId} code={lot.lotCode} />
                )}
                <EmptiedLine pile={lot} />
                <ExpiryChip expiresAt={lot.lotExpiresAt} />
                {!showPlaces && !each.isAvailable && <NotUsableHere />}
              </Stack>
              <span>
                {displayWithUnit(lot.quantity, row.unitOfMeasure, intl)}
              </span>
              <PileActions
                pile={lot}
                handlers={handlers}
                buttonRef={lot.id === firstPile ? first : undefined}
              />
            </Stack>
          ))}
        </Box>
      ))}
    </Stack>
  );
}
