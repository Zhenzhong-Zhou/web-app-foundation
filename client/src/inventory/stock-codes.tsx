import {
  Box,
  Button,
  Link,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import {
  type MouseEvent,
  type ReactNode,
  type RefObject,
  useEffect,
  useId,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type {
  Location,
  StockCodePlaces,
  StockCodeRow,
  StockPlace,
} from '../api/types.gen';
import { type Action, ActionsMenu } from '../components/actions-menu';
import { ExpiryChip } from '../components/expiry-chip';
import { LotLink } from '../components/lot-link';
import { OpeningButton } from '../components/opening-button';
import { PlaceholderRows } from '../components/placeholder-rows';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { TableOrCards } from '../components/table-or-cards';
import { api } from '../lib/api';
import type { StockCodeSort } from '../lib/api-names';
import {
  displayQuantity,
  formatDay,
  itemName,
  nameAndCode,
  NO_VALUE,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import type { SortOrder } from '../lib/use-list-sort';
import { useOpenRows } from '../lib/use-open-rows';
import { NameAndCode } from '../products/name-and-code';
import { displayWithUnit } from '../products/units';
import { STATUS_TONES } from '../theme/status';
import type { MoveMode } from './move-stock-dialog';
import type { HistoryOf } from './movement-history-dialog';
import type { ReorderItem } from './reorder-point-dialog';
import { type Pile, StockActions } from './stock-actions';

/** What a row's menus do, as the Stock tab answers them. */
export interface StockHandlers {
  canMove: boolean;
  canAdjust: boolean;
  canReorder: boolean;
  onMove: (mode: MoveMode, row: Pile) => void;
  onHistory: (of: HistoryOf) => void;
  onEditLot: (row: Pile) => void;
  onReorder: (item: ReorderItem) => void;
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
  onHand: { id: 'inventory.promised.onHand', defaultMessage: 'On hand' },
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
  actions: { id: 'common.actions', defaultMessage: 'Actions' },
  noneOnHand: {
    id: 'inventory.stock.noneOnHand',
    defaultMessage: 'None on hand',
  },
});

/** A quantity of nothing, which the API always writes with four places. */
const NONE = '0.0000';

/** Held and Coming leave the table between 600 and 899 px (R14). */
const WIDE_ONLY = { display: { xs: 'none', md: 'table-cell' } } as const;

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

/** The item's page, at Where it stands or one of its parts (ADR-093, R8). */
function whereItStands(productId: string, part = 'stock'): string {
  return `/items/${productId}#${part}`;
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
  onLeave,
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
    onLeave,
  };

  return (
    <TableOrCards
      loading={loading}
      table={
        <TableContainer>
          <Table size="small">
            <TableHead>
              <TableRow>
                <SortHeader
                  label={intl.formatMessage(HEADS.item)}
                  {...header('name')}
                />
                <TableCell>
                  {place
                    ? intl.formatMessage(HEADS.lotsHere)
                    : intl.formatMessage(HEADS.where)}
                </TableCell>
                <SortHeader
                  align="right"
                  label={
                    place
                      ? intl.formatMessage(HEADS.onHandHere)
                      : intl.formatMessage(HEADS.onHand)
                  }
                  {...header('onHand')}
                />
                <TableCell align="right">
                  {place
                    ? intl.formatMessage(HEADS.freeEverywhere)
                    : intl.formatMessage(HEADS.free)}
                </TableCell>
                <TableCell align="right" sx={WIDE_ONLY}>
                  {place
                    ? intl.formatMessage(HEADS.heldEverywhere)
                    : intl.formatMessage(HEADS.held)}
                </TableCell>
                <TableCell align="right" sx={WIDE_ONLY}>
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
                />
                <TableCell>{intl.formatMessage(HEADS.actions)}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && <PlaceholderRows columns={9} wideOnly={2} />}
              {rows?.map((row) => (
                <CodeTableRow key={row.variantId} row={row} {...opened} />
              ))}
            </TableBody>
          </Table>
        </TableContainer>
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
 * row).
 */
interface Returning {
  /** The codes whose rows are open. */
  opens: string[];
  onOpen: (variantId: string, open: boolean) => void;
  /** The code whose name takes focus once its row is drawn. */
  focusRow: string | null;
  /** Left for the item's page from this code's row. */
  onLeave: (variantId: string) => void;
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
): Promise<StockPlace[]> {
  const params = new URLSearchParams();
  if (place) params.set('locationId', place.id);
  if (includeEmpty) params.set('includeEmpty', 'true');
  return api<StockCodePlaces>(
    `/stock/by-code/${row.variantId}/places?${params.toString()}`,
  ).then((answer) => answer.places);
}

/** A code's places and their lots, read as its row opens (R2). */
function usePlaces(row: StockCodeRow, opened: Opened) {
  return useOpenRows(
    () => readPlaces(row, opened),
    opened.changes,
    opened.opens.includes(row.variantId),
  );
}

/**
 * The row's name, focused when Back returns to the row it was left from;
 * and what keeps that row as left from: a click on a link to its item.
 */
function useReturn(row: StockCodeRow, { focusRow, onLeave }: Opened) {
  const name = useRef<HTMLAnchorElement>(null);
  const returned = focusRow === row.variantId;
  useEffect(() => {
    if (returned) name.current?.focus();
  }, [returned]);

  const leaving = (event: MouseEvent) => {
    const link = (event.target as HTMLElement).closest('a');
    if (link?.getAttribute('href')?.startsWith('/items/')) {
      onLeave(row.variantId);
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
  return place ? (row.here?.onHand ?? NONE) : row.onHand;
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
) {
  const [choosing, setChoosing] = useState(false);
  const first = useRef<HTMLButtonElement>(null);

  // Focus on the first lot's Actions once the lots are drawn.
  const drawn = places.open && places.rows !== null;
  useEffect(() => {
    if (choosing && drawn) first.current?.focus();
  }, [choosing, drawn]);
  /** The row's own button: closed, it no longer asks for a lot. */
  function toggle() {
    if (places.open) setChoosing(false);
    opened.onOpen(row.variantId, !places.open);
    places.toggle();
  }

  async function act(mode: MoveMode) {
    if (onePile(row, opened)) {
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
    setChoosing(true);
    if (!places.open) {
      opened.onOpen(row.variantId, true);
      places.toggle();
    }
  }

  return { choosing, first, act, toggle };
}

/** The item's name as a row says it: "Focus, 60 capsules". */
function nameOf(row: { productName: string; variantName: string | null }) {
  return itemName(row.productName, row.variantName);
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

  if (onHandOf(row, opened) !== NONE) return NO_VALUE;
  return (
    <Typography variant="body2" sx={{ color: 'text.secondary' }}>
      {intl.formatMessage(HEADS.noneOnHand)}
    </Typography>
  );
}

/** A code's row in the table, and the rows it opens to after it. */
function CodeTableRow({ row, ...opened }: { row: StockCodeRow } & Opened) {
  const intl = useIntl();
  const places = usePlaces(row, opened);
  const choice = usePileChoice(row, opened, places);
  const back = useReturn(row, opened);
  const controls = useId();
  const words = openWords(row, opened, intl);
  const name = nameOf(row);

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
          {row.held === NONE
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
          <ExpiryChip
            expiresAt={
              opened.place ? (row.here?.expiresFirst ?? null) : row.expiresFirst
            }
          />
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

/** On hand, and its not-usable part under it (R1). */
function OnHand({ row, here }: { row: StockCodeRow; here: boolean }) {
  const intl = useIntl();
  const onHand = here ? (row.here?.onHand ?? NONE) : row.onHand;

  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(onHand, row.unitOfMeasure, intl)}</span>
      {!here && row.notUsable !== NONE && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
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

/** Free, and what confirmed orders want beyond it, a link to Held (16a). */
function Free({ row }: { row: StockCodeRow }) {
  const intl = useIntl();

  return (
    <Stack sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(row.free, row.unitOfMeasure, intl)}</span>
      {row.short !== NONE && (
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

/** Coming, with its soonest day; a run has none. */
function Coming({ row }: { row: StockCodeRow }) {
  const intl = useIntl();

  if (row.coming === NONE) return NO_VALUE;
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
  const intl = useIntl();

  if (!row.status || row.reorderPoint === null) return NO_VALUE;
  return (
    <Stack spacing={0.5} sx={{ alignItems: 'flex-start' }}>
      <StatusChip
        tone={STATUS_TONES.reorder[row.status]}
        label={intl.formatMessage(
          {
            id: 'inventory.reorder.status',
            defaultMessage:
              '{status, select, out {Out} low {Low} enough {Enough} other {Discontinued}}',
          },
          { status: row.status },
        )}
      />
      <Link
        component={RouterLink}
        to={whereItStands(row.productId)}
        state={OFFER_BACK}
        variant="body2"
        sx={{ whiteSpace: 'nowrap' }}
      >
        {intl.formatMessage(
          {
            id: 'inventory.stock.left',
            defaultMessage: '{left} left · reorder at {point}',
          },
          {
            left: displayQuantity(row.position),
            point: displayQuantity(row.reorderPoint),
          },
        )}
      </Link>
    </Stack>
  );
}

/**
 * A code's one Actions button: its movements, the history dialog for the
 * code alone until Movements' branch, and its reorder point by
 * permission. A lot's own actions are on its row.
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
  const { handlers } = opened;
  const actions: Action[] = [
    {
      label: intl.formatMessage({
        id: 'layout.nav.movements',
        defaultMessage: 'Movements',
      }),
      onSelect: () =>
        handlers.onHistory({ ...row, lotId: null, lotCode: null, at: null }),
    },
  ];
  // What changes stock acts on a pile, so only with something on hand
  // where the row stands.
  if (handlers.canMove && onHandOf(row, opened) !== NONE) {
    actions.push(
      {
        label: intl.formatMessage({
          id: 'inventory.actions.move',
          defaultMessage: 'Move',
        }),
        onSelect: () => onPile('transfer'),
      },
      {
        label: intl.formatMessage({
          id: 'inventory.move.ship.title',
          defaultMessage: 'Ship out',
        }),
        onSelect: () => onPile('ship'),
      },
      {
        label: intl.formatMessage({
          id: 'inventory.actions.sendSample',
          defaultMessage: 'Send sample',
        }),
        onSelect: () => onPile('sample'),
      },
    );
    if (handlers.canAdjust) {
      actions.push({
        label: intl.formatMessage({
          id: 'inventory.move.adjust.title',
          defaultMessage: 'Correct the count',
        }),
        onSelect: () => onPile('adjust'),
      });
    }
  }
  // The item's, not a lot's: one point across every place (ADR-085).
  if (handlers.canReorder) {
    actions.push({
      label:
        row.reorderPoint === null
          ? intl.formatMessage({
              id: 'products.stock.setPoint',
              defaultMessage: 'Set a reorder point',
            })
          : intl.formatMessage({
              id: 'products.stock.changePoint',
              defaultMessage: 'Change reorder point',
            }),
      onSelect: () => handlers.onReorder(row),
    });
  }

  return (
    <ActionsMenu
      name={intl.formatMessage(
        {
          id: 'inventory.stock.actions',
          defaultMessage: 'Actions for {sku}',
        },
        { sku: row.sku },
      )}
      actions={actions}
    />
  );
}

/**
 * "Choose the lot", above the lots a pile's action from the code's row
 * opened to; "Choose the place" for a code not tracked by lot.
 */
function ChooseLine({ places }: { places: StockPlace[] }) {
  const intl = useIntl();
  const tracked = places.some((each) =>
    each.lots.some((lot) => lot.lotId !== null),
  );

  return (
    <Typography role="status" variant="body2" sx={{ fontWeight: 600 }}>
      {tracked
        ? intl.formatMessage({
            id: 'inventory.stock.chooseLot',
            defaultMessage: 'Choose the lot.',
          })
        : intl.formatMessage({
            id: 'inventory.stock.choosePlace',
            defaultMessage: 'Choose the place.',
          })}
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
}: {
  id: string;
  row: StockCodeRow;
  places: StockPlace[] | null;
  failure: unknown;
  onRetry: () => void;
  /** Opened by a pile's action from the code's row: "Choose the lot". */
  choosing: boolean;
  /** The first lot's Actions, which focus moves to while choosing. */
  first: RefObject<HTMLButtonElement | null>;
} & Opened) {
  const intl = useIntl();

  if (failure) {
    return (
      <TableRow id={id}>
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
    <TableRow sx={{ bgcolor: 'action.hover' }}>
      <TableCell colSpan={7} sx={{ pl: 6 }}>
        <ChooseLine places={places} />
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
          lotsOpen={choosing}
          actionsRef={index === 0 ? first : undefined}
        />
      ))}
    </>
  );
}

/** A place's row: its name, why it is not usable, its lots behind a button. */
function PlaceTableRow({
  id,
  row,
  place,
  handlers,
  lotsOpen,
  actionsRef,
}: {
  id?: string;
  row: StockCodeRow;
  place: StockPlace;
  handlers: StockHandlers;
  /** Its lots shown from the start: a lot is being chosen. */
  lotsOpen: boolean;
  /** Its first lot's Actions, or its own for a code not tracked by lot. */
  actionsRef?: RefObject<HTMLButtonElement | null>;
}) {
  const intl = useIntl();
  const lotsId = useId();
  // Its lots came with it, so opening reads nothing.
  const [open, setOpen] = useState(lotsOpen);
  // A lot asked for opens them, as React adjusts state to a prop.
  const [asked, setAsked] = useState(lotsOpen);
  if (lotsOpen !== asked) {
    setAsked(lotsOpen);
    if (lotsOpen) setOpen(true);
  }
  const tracked = place.lots.some((lot) => lot.lotId !== null);
  const where = nameAndCode(place.locationName ?? '', place.locationCode);
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
        <TableCell sx={{ pl: 6 }}>
          <Stack>
            <span>{where}</span>
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
              onClick={() => setOpen(!open)}
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
              the code's Movements at this place. */}
          {!tracked && place.lots[0] ? (
            <PileActions
              pile={place.lots[0]}
              handlers={handlers}
              buttonRef={actionsRef}
            />
          ) : (
            <PlaceActions row={row} place={place} handlers={handlers} />
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

/** A place's Actions: the code's Movements at that place (ADR-093). */
function PlaceActions({
  row,
  place,
  handlers,
}: {
  row: StockCodeRow;
  place: StockPlace;
  handlers: StockHandlers;
}) {
  const intl = useIntl();
  const where = nameAndCode(place.locationName ?? '', place.locationCode);

  return (
    <ActionsMenu
      name={intl.formatMessage(
        {
          id: 'inventory.actions.label',
          defaultMessage: 'Actions for {sku} at {location}',
        },
        { sku: row.sku, location: where },
      )}
      actions={[
        {
          label: intl.formatMessage({
            id: 'layout.nav.movements',
            defaultMessage: 'Movements',
          }),
          onSelect: () =>
            handlers.onHistory({
              ...row,
              lotId: null,
              lotCode: null,
              at: { locationId: place.locationId, locationName: where },
            }),
        },
      ]}
    />
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
      <TableCell sx={{ pl: 3 + depth * 3 }}>
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
      onHistory={handlers.onHistory}
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
  const places = usePlaces(row, opened);
  const choice = usePileChoice(row, opened, places);
  const back = useReturn(row, opened);
  const controls = useId();
  const words = openWords(row, opened, intl);
  const name = nameOf(row);

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
        <Figure label={intl.formatMessage(HEADS.onHand)}>
          <OnHand row={row} here={!!opened.place} />
        </Figure>
        <Figure label={intl.formatMessage(HEADS.free)}>
          <Free row={row} />
        </Figure>
        <Figure label={intl.formatMessage(HEADS.expiresFirst)}>
          <ExpiryChip
            expiresAt={
              opened.place ? (row.here?.expiresFirst ?? null) : row.expiresFirst
            }
          />
        </Figure>
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
            <Figure label={intl.formatMessage(HEADS.held)}>
              {displayWithUnit(row.held, row.unitOfMeasure, intl)}
            </Figure>
            <Figure label={intl.formatMessage(HEADS.coming)}>
              <Coming row={row} />
            </Figure>
            {choice.choosing && places.rows && (
              <ChooseLine places={places.rows} />
            )}
            <OpenedCard
              row={row}
              places={places.rows}
              failure={places.failure}
              onRetry={places.retry}
              first={choice.first}
              {...opened}
            />
          </Stack>
        )}
      </Stack>
    </Box>
  );
}

/** A figure on a card: its name, then its value. */
function Figure({ label, children }: { label: string; children: ReactNode }) {
  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ justifyContent: 'space-between', alignItems: 'flex-start' }}
    >
      <Typography variant="body2" sx={{ color: 'text.secondary' }}>
        {label}
      </Typography>
      <Box sx={{ textAlign: 'right' }}>{children}</Box>
    </Stack>
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
              <Stack>
                <Typography sx={{ fontWeight: 600 }}>
                  {nameAndCode(each.locationName ?? '', each.locationCode)}
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
