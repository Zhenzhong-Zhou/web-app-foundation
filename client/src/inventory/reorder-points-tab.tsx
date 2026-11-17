import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  MenuItem,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useLocation, useNavigate } from 'react-router-dom';

import type { ReorderPointCounts, ReorderPointRow } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow, QuickFilterPill } from '../components/filter-row';
import { FiltersButton } from '../components/filters-button';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { PlaceholderRows } from '../components/placeholder-rows';
import { SortHeader } from '../components/sort-header';
import { TableOrCards } from '../components/table-or-cards';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { LearnMore } from '../help/learn-more';
import { displayQuantity, itemName, NO_VALUE } from '../lib/format';
import { HIDDEN } from '../lib/hidden';
import { openDialog } from '../lib/open-dialog';
import { useCards } from '../lib/use-cards';
import { useKeysetList } from '../lib/use-keyset-list';
import { oneOf, useListFilters } from '../lib/use-list-filters';
import { useListSearch } from '../lib/use-list-search';
import { useListSort, withSort } from '../lib/use-list-sort';
import { useResource } from '../lib/use-resource';
import { fillState } from '../orders/order-fill';
import { CreateRunDialog } from '../production/create-run-dialog';
import { NameAndCode } from '../products/name-and-code';
import { displayWithUnit } from '../products/units';
import { NARROW_ONLY, WIDE_ONLY } from '../theme/media';
import { rem } from '../theme/rem';
import { PositionBar } from './position-bar';
import { RemoveReorderPointDialog } from './remove-reorder-point-dialog';
import { ReorderPointActions } from './reorder-point-actions';
import { DocumentLink, ReorderPointDetail } from './reorder-point-detail';
import {
  type ReorderOpening,
  ReorderPointDialog,
} from './reorder-point-dialog';
import {
  atOrBelowZero,
  choiceOf,
  fieldQuantity,
  plansRun,
} from './reorder-points';
import { LeftLine, ReorderStatusChip } from './reorder-status';
import { keepTicks, ticksOf } from './reorder-ticks';

/** A page of the list (ADR-051), as the server's own default. */
const PAGE_SIZE = 50;

/** The list's three views (ADR-085): '' is All; Low holds the out too. */
const FILTERS = ['', 'low', 'out'] as const;
type Filter = (typeof FILTERS)[number];

/** The view in the address (ADR-091), All left out: `?status=low`. */
const ADDRESS_FILTERS = { status: oneOf<Filter>(FILTERS, '') };

/** What the list sorts by besides its own order (ADR-093; #473's 16). */
const SORTS = ['suggested'] as const;

/** A path on the list's routes, its filter and search added. */
function pathOf(base: string, query: Record<string, string>): string {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== ''),
  );
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

/**
 * What a row's item is: bought or made, and how much its rule orders, in
 * words (ADR-093; #459): "Bought · orders what is short", "Made · in
 * multiples of 1,000", never a pack the app does not know.
 */
function useKindLine(): (row: ReorderPointRow) => string {
  const intl = useIntl();

  return (row) =>
    row.status === 'discontinued'
      ? intl.formatMessage({
          id: 'inventory.reorder.discontinued',
          defaultMessage: 'Discontinued · never low, its point kept',
        })
      : intl.formatMessage(
          {
            id: 'inventory.reorder.kindLine',
            defaultMessage:
              '{source, select, made {Made} other {Bought}} · {rule, select, fixed {in multiples of {quantity}} maximum {up to {quantity}} other {{source, select, made {makes what is short} other {orders what is short}}}}',
          },
          {
            source: row.source,
            rule: row.rule,
            quantity: displayQuantity(
              row.fixedQuantity ?? row.maximumQuantity ?? '',
            ),
          },
        );
}

/** The grey line under a row's name: its code, then bought or made. */
function CodeLine({ row }: { row: ReorderPointRow }) {
  const kindLine = useKindLine();

  return (
    <>
      <Box component="span" sx={{ display: 'block' }}>
        {row.sku}
      </Box>
      <Box component="span" sx={{ display: 'block' }}>
        {kindLine(row)}
      </Box>
    </>
  );
}

/** The status in Home's words, with its icon, never by colour alone. */
function Status({ row }: { row: ReorderPointRow }) {
  return <ReorderStatusChip status={row.status} withIcon />;
}

/**
 * Where it stands (ADR-093, R7): "10 left · reorder at 36", a link to the
 * item's Where it stands, and under it ADR-085's bar, unchanged; the
 * chip beside it and these words carry the status, so the bar's colour is
 * never alone.
 */
function Stands({ row }: { row: ReorderPointRow }) {
  return (
    <Stack spacing={0.75} sx={{ alignItems: 'flex-start' }}>
      <LeftLine
        position={row.position}
        reorderPoint={row.reorderPoint}
        productId={row.productId}
      />
      {row.status !== 'discontinued' && (
        <PositionBar
          position={row.position}
          point={row.reorderPoint}
          status={row.status}
        />
      )}
    </Stack>
  );
}

/** The suggested order with its unit, and a fixed rule's "5 × 12" under it. */
function Suggestion({ row }: { row: ReorderPointRow }) {
  const intl = useIntl();

  if (row.status === 'discontinued' || atOrBelowZero(row.suggestion)) {
    return NO_VALUE;
  }

  return (
    <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
      <span>{displayWithUnit(row.suggestion, row.unitOfMeasure, intl)}</span>
      {row.rule === 'fixed' && row.suggestedMultiples && row.fixedQuantity && (
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage(
            {
              id: 'inventory.reorder.multiples',
              defaultMessage: '{count} × {quantity}',
            },
            {
              count: displayQuantity(row.suggestedMultiples),
              quantity: displayQuantity(row.fixedQuantity),
            },
          )}
        </Typography>
      )}
    </Stack>
  );
}

/**
 * What is in draft for the row, in its own cell (#459): "Drafted in
 * PO-000014 · 60", the document a link. With `focused`, its first link
 * takes focus once drafted, or the cell itself for a reader who cannot
 * open the run: a run just planned from the row, whose Make is gone, so
 * focus does not fall to the page's start (WCAG 2.4.3).
 */
function Drafts({
  row,
  focused = false,
}: {
  row: ReorderPointRow;
  focused?: boolean;
}) {
  const intl = useIntl();
  const draftsRef = useRef<HTMLDivElement>(null);
  const drafted = row.drafts.length > 0;
  useEffect(() => {
    if (!focused || !drafted) return;
    const drafts = draftsRef.current;
    (drafts?.querySelector('a') ?? drafts)?.focus();
  }, [focused, drafted]);

  if (!drafted) return NO_VALUE;

  return (
    <Stack ref={draftsRef} tabIndex={focused ? -1 : undefined} spacing={0.25}>
      {row.drafts.map((draft) => (
        <Typography
          key={`${draft.kind}-${draft.id}`}
          variant="body2"
          component="span"
        >
          {intl.formatMessage(
            {
              id: 'inventory.reorder.draftedIn',
              defaultMessage: 'Drafted in {document} · {quantity}',
            },
            {
              document: (
                <DocumentLink
                  kind={draft.kind}
                  id={draft.id}
                  number={draft.number}
                />
              ),
              quantity: displayQuantity(draft.quantity),
            },
          )}
        </Typography>
      ))}
    </Stack>
  );
}

/**
 * A row's box to tick it for one purchase order (ADR-085), for whoever may
 * buy: a bought low item with something to order. One whose draft covers
 * it is greyed, its reason beside it, not in a hover a phone never has
 * (#459).
 */
function ChooseBox({
  row,
  chosen,
  onChoose,
}: {
  row: ReorderPointRow;
  chosen: boolean;
  onChoose: (row: ReorderPointRow, on: boolean) => void;
}) {
  const intl = useIntl();
  const choice = choiceOf(row);
  const label = intl.formatMessage(
    { id: 'inventory.reorder.choose', defaultMessage: 'Choose {name}' },
    { name: itemName(row.productName, row.variantName) },
  );

  if (choice === 'open') {
    return (
      <Checkbox
        checked={chosen}
        onChange={(event) => onChoose(row, event.target.checked)}
        slotProps={{ input: { 'aria-label': label } }}
      />
    );
  }
  if (choice === 'drafted') {
    return (
      <Stack sx={{ alignItems: 'flex-start' }}>
        <Checkbox disabled slotProps={{ input: { 'aria-label': label } }} />
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', maxWidth: rem(100) }}
        >
          {intl.formatMessage({
            id: 'inventory.reorder.inADraft',
            defaultMessage: 'In a draft already',
          })}
        </Typography>
      </Stack>
    );
  }
  return null;
}

/**
 * A row's main action, saying what it makes and how many (ADR-093, 19a):
 * Buy 30 on a bought row, for whoever may buy, opening New order filled
 * in; Make 1,000 on a made one, for whoever may plan a run, opening Plan
 * a run filled in. Nothing is saved until it is confirmed there.
 */
function MainAction({
  row,
  onBuy,
  onPlan,
}: {
  row: ReorderPointRow;
  onBuy: ((row: ReorderPointRow) => void) | null;
  onPlan: ((row: ReorderPointRow) => void) | null;
}) {
  const intl = useIntl();
  const quantity = displayQuantity(row.suggestion);
  const values = { quantity, name: itemName(row.productName, row.variantName) };

  if (onBuy && choiceOf(row) === 'open') {
    return (
      <Button
        variant="outlined"
        size="small"
        sx={{ whiteSpace: 'nowrap' }}
        aria-label={intl.formatMessage(
          {
            id: 'inventory.reorder.buyOf',
            defaultMessage: 'Buy {quantity} of {name}',
          },
          values,
        )}
        onClick={() => onBuy(row)}
      >
        {intl.formatMessage(
          { id: 'inventory.reorder.buy', defaultMessage: 'Buy {quantity}' },
          values,
        )}
      </Button>
    );
  }
  if (onPlan && plansRun(row)) {
    return (
      <Button
        variant="outlined"
        size="small"
        sx={{ whiteSpace: 'nowrap' }}
        aria-label={intl.formatMessage(
          {
            id: 'inventory.reorder.makeOf',
            defaultMessage: 'Make {quantity} of {name}',
          },
          values,
        )}
        onClick={openDialog(() => onPlan(row))}
      >
        {intl.formatMessage(
          { id: 'inventory.reorder.make', defaultMessage: 'Make {quantity}' },
          values,
        )}
      </Button>
    );
  }
  return null;
}

/** What a row and its card are handed: its tick, its actions, and its menu. */
interface RowProps {
  row: ReorderPointRow;
  /** Whether this reader may tick rows to buy (orders.create). */
  choosing: boolean;
  chosen: boolean;
  onChoose: (row: ReorderPointRow, on: boolean) => void;
  /** Buy one row, for whoever may (orders.create). */
  onBuy: ((row: ReorderPointRow) => void) | null;
  /** Make a made low item, for whoever may (production.create). */
  onPlan: ((row: ReorderPointRow) => void) | null;
  /** Its run was just planned here: its draft's link takes focus. */
  planned: boolean;
  /** The row's menu, for whoever may set a point (stock.reorder). */
  actions: ReactNode;
}

/** The draft's cell leaves the table between 600 and 899 px (R14). */

/** A row of the table, and under it, once opened, where it stands. */
function PointRow({
  row,
  columns,
  choosing,
  chosen,
  onChoose,
  onBuy,
  onPlan,
  planned,
  actions,
}: RowProps & { columns: number }) {
  const intl = useIntl();
  const [open, setOpen] = useState(false);
  const grey = row.status === 'discontinued';
  const detailId = `reorder-detail-${row.id}`;

  return (
    <>
      {/* The name is the row's one way in (ADR-093 v3): the row tints under
          the pointer, which stays an arrow. */}
      <TableRow
        hover
        sx={{
          '& > td': {
            verticalAlign: 'top',
            ...(open && { borderBottom: 0 }),
            ...(grey && { color: 'text.secondary' }),
          },
        }}
      >
        {choosing && (
          <TableCell padding="checkbox">
            <ChooseBox row={row} chosen={chosen} onChoose={onChoose} />
          </TableCell>
        )}
        <TableCell>
          <NameAndCode
            name={itemName(row.productName, row.variantName)}
            code={<CodeLine row={row} />}
            type={row.type}
            coverFileId={row.coverFileId}
            to={`/items/${row.productId}`}
          />
        </TableCell>
        <TableCell>
          <Status row={row} />
        </TableCell>
        <TableCell>
          <Stands row={row} />
        </TableCell>
        <TableCell align="right" sx={{ whiteSpace: 'nowrap' }}>
          <Suggestion row={row} />
          {/* Focus goes to whichever copy shows: focus on a hidden one does
              nothing (WCAG 2.4.3, review 60). */}
          <Box sx={{ ...NARROW_ONLY, mt: 0.5, textAlign: 'left' }}>
            {!!row.drafts.length && <Drafts row={row} focused={planned} />}
          </Box>
        </TableCell>
        <TableCell sx={WIDE_ONLY}>
          <Drafts row={row} focused={planned} />
        </TableCell>
        <TableCell padding="checkbox">
          {/* Apart, so each is a target of its own (WCAG 2.5.8). */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
          >
            <MainAction row={row} onBuy={onBuy} onPlan={onPlan} />
            {!grey && (
              <IconButton
                size="small"
                aria-expanded={open}
                aria-controls={open ? detailId : undefined}
                aria-label={intl.formatMessage(
                  {
                    id: 'inventory.reorder.details',
                    defaultMessage: 'Where {sku} stands',
                  },
                  { sku: row.sku },
                )}
                onClick={() => setOpen((was) => !was)}
              >
                {open ? <KeyboardArrowUp /> : <KeyboardArrowDown />}
              </IconButton>
            )}
            {actions}
          </Stack>
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={detailId}>
          <TableCell colSpan={columns - 1} sx={{ pt: 0 }}>
            <ReorderPointDetail row={row} />
          </TableCell>
          {/* In draft's column, gone below 900 px with its header (R14). */}
          <TableCell sx={{ ...WIDE_ONLY, pt: 0 }} />
        </TableRow>
      )}
    </>
  );
}

/**
 * A row as a card below 600 px (the design language's Lists on a phone;
 * R14): its tick, the name and its code, the status with where it stands,
 * the suggestion, what is in draft, and Buy or Make with the menu.
 */
function PointCard({
  row,
  choosing,
  chosen,
  onChoose,
  onBuy,
  onPlan,
  planned,
  actions,
}: RowProps) {
  const intl = useIntl();
  const suggested = !(
    row.status === 'discontinued' || atOrBelowZero(row.suggestion)
  );

  return (
    <Box
      component="li"
      sx={{
        listStyle: 'none',
        p: 2,
        '& + &': { borderTop: 1, borderColor: 'divider' },
      }}
    >
      <Stack spacing={1}>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'flex-start' }}>
          {choosing && (
            <ChooseBox row={row} chosen={chosen} onChoose={onChoose} />
          )}
          <NameAndCode
            name={itemName(row.productName, row.variantName)}
            code={<CodeLine row={row} />}
            type={row.type}
            coverFileId={row.coverFileId}
            to={`/items/${row.productId}`}
          />
        </Stack>
        <Stack
          direction="row"
          useFlexGap
          sx={{ flexWrap: 'wrap', alignItems: 'center', gap: 1 }}
        >
          <Status row={row} />
          <Stands row={row} />
        </Stack>
        {suggested && (
          <Typography variant="body2">
            {intl.formatMessage(
              {
                id: 'inventory.reorder.suggestedLine',
                defaultMessage:
                  '{source, select, made {Suggested run} other {Suggested order}}: {quantity}',
              },
              {
                source: row.source,
                quantity: displayWithUnit(
                  row.suggestion,
                  row.unitOfMeasure,
                  intl,
                ),
              },
            )}
          </Typography>
        )}
        {!!row.drafts.length && <Drafts row={row} focused={planned} />}
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <MainAction row={row} onBuy={onBuy} onPlan={onPlan} />
          <Box sx={{ flex: 1 }} />
          {actions}
        </Stack>
      </Stack>
    </Box>
  );
}

/**
 * The bar's legend (ADR-093, R7; #459): each colour named, and the mark,
 * the reorder point, always in the middle.
 */
function Legend() {
  const intl = useIntl();
  const swatch = (
    tone: 'warning.main' | 'success.main' | null,
  ): ReactElement => (
    <Box
      aria-hidden
      component="span"
      sx={{
        display: 'inline-block',
        width: rem(16),
        height: 8,
        borderRadius: 999,
        ...(tone
          ? { bgcolor: tone }
          : {
              bgcolor: 'action.hover',
              outline: 1,
              outlineColor: 'error.main',
            }),
      }}
    />
  );
  const status = (value: 'low' | 'enough' | 'out') =>
    intl.formatMessage(
      {
        id: 'inventory.reorder.status',
        defaultMessage:
          '{status, select, out {Out} low {Low} enough {Enough} other {Discontinued}}',
      },
      { status: value },
    );
  const items: [ReactElement, string][] = [
    [swatch('warning.main'), status('low')],
    [swatch('success.main'), status('enough')],
    [swatch(null), status('out')],
    [
      <Box
        key="mark"
        aria-hidden
        component="span"
        sx={{
          display: 'inline-block',
          width: 2,
          height: 14,
          bgcolor: 'text.primary',
        }}
      />,
      intl.formatMessage({
        id: 'inventory.reorder.legendPoint',
        defaultMessage: 'the reorder point, always in the middle',
      }),
    ],
  ];

  return (
    <Stack
      direction="row"
      useFlexGap
      sx={{ flexWrap: 'wrap', columnGap: 2, rowGap: 0.5 }}
    >
      {items.map(([mark, words]) => (
        <Stack
          key={words}
          direction="row"
          spacing={0.75}
          sx={{ alignItems: 'center' }}
        >
          {mark}
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            {words}
          </Typography>
        </Stack>
      ))}
    </Stack>
  );
}

/**
 * The ticked rows, floating at the foot of the list while any is ticked
 * (ADR-085): how many, each with its suggestion, Clear, and Buy 2 on one
 * purchase order, the row's verb (ADR-093), which opens New order filled
 * in with them.
 */
function ChosenBar({
  chosen,
  onClear,
  onRaise,
}: {
  chosen: ReorderPointRow[];
  onClear: () => void;
  onRaise: () => void;
}) {
  const intl = useIntl();

  return (
    <Paper
      role="region"
      aria-label={intl.formatMessage({
        id: 'inventory.reorder.chosenBar',
        defaultMessage: 'Chosen to order',
      })}
      elevation={6}
      sx={{
        position: 'sticky',
        bottom: (theme) => theme.spacing(2),
        zIndex: (theme) => theme.zIndex.appBar,
        px: 2,
        py: 1.25,
        bgcolor: 'text.primary',
        color: 'background.paper',
        // The theme's ring, the accent, is under 3 : 1 on the dark bar
        // (WCAG 1.4.11): in the bar's own text colour, which is.
        '& .MuiButtonBase-root.Mui-focusVisible': {
          outlineColor: (theme) => theme.palette.background.paper,
        },
      }}
    >
      <Stack
        direction="row"
        useFlexGap
        sx={{ flexWrap: 'wrap', alignItems: 'center', columnGap: 2, rowGap: 1 }}
      >
        <Typography sx={{ fontWeight: 600 }}>
          {intl.formatMessage(
            {
              id: 'inventory.reorder.chosen',
              defaultMessage: '{count, plural, other {# chosen}}',
            },
            { count: chosen.length },
          )}
        </Typography>
        <Box
          component="ul"
          sx={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 1.5,
            listStyle: 'none',
            m: 0,
            p: 0,
            flex: '1 1 auto',
          }}
        >
          {chosen.map((row) => (
            <Typography key={row.id} component="li" variant="body2">
              {intl.formatMessage(
                {
                  id: 'inventory.reorder.chosenLine',
                  defaultMessage: '{name} · {quantity}',
                },
                {
                  name: itemName(row.productName, row.variantName),
                  quantity: displayQuantity(row.suggestion),
                },
              )}
            </Typography>
          ))}
        </Box>
        <Button variant="text" color="inherit" onClick={onClear}>
          {intl.formatMessage({
            id: 'inventory.reorder.clear',
            defaultMessage: 'Clear',
          })}
        </Button>
        <Button onClick={onRaise}>
          {intl.formatMessage(
            {
              id: 'inventory.reorder.buyChosen',
              defaultMessage:
                '{count, plural, one {Buy # on a purchase order} other {Buy # on one purchase order}}',
            },
            { count: chosen.length },
          )}
        </Button>
      </Stack>
    </Paper>
  );
}

/**
 * Inventory's Reorder (ADR-085, ADR-093): every item with a point and
 * where it stands, low first, as the server orders it, or by the
 * suggested order, most first. All, Low and Out with their counts from
 * the server; the search, as every list's (ADR-056); each row's Buy or
 * Make, saying how many, opening its form filled in; bought low rows
 * ticked for one purchase order by someone who may buy; each row opened
 * to where its position comes from. The figures are the server's, never
 * added up here (ADR-025). A table from 600 px, cards below it (R14).
 *
 * Whoever may set a point (stock.reorder) adds one at the title's right,
 * and edits or removes it from its row's menu; the list and its counts
 * read again after each.
 *
 * Home's card and the bell open it on Low: `?tab=reorder&status=low`.
 */
export function ReorderPointsTab({ tabs }: { tabs: ReactNode }) {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();
  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const filter = filters.status;
  // A new filter clears the ticks, as ADR-093's Reorder table says; the
  // search keeps them, so a buyer can gather items one search at a time.
  const setFilter = (status: Filter) => {
    setChosen(new Map());
    setFilters({ status });
  };
  const { text, setText, search } = useListSearch();
  const { sort, set: setSort, clear: clearSort } = useListSort(SORTS);
  const phone = useCards();
  // By item, kept while the search changes and through Back from the
  // purchase order they were sent to (reorder-ticks.ts).
  const { key: entry } = useLocation();
  const [chosen, setChosen] = useState<Map<string, ReorderPointRow>>(() =>
    ticksOf(entry),
  );
  const [opening, setOpening] = useState<ReorderOpening | null>(null);
  const [removing, setRemoving] = useState<ReorderPointRow | null>(null);
  const [planning, setPlanning] = useState<ReorderPointRow | null>(null);
  /** The item whose run was just planned from its row. */
  const [planned, setPlanned] = useState<string | null>(null);

  const choosing = can('orders.create');
  const setting = can('stock.reorder');
  const planner = can('production.create');
  const query = { status: filter, search };
  const listPath = withSort(
    pathOf('/stock/reorder-points', { ...query, limit: String(PAGE_SIZE) }),
    sort,
  );
  const countsPath = pathOf('/stock/reorder-points/counts', { search });

  const {
    entries: rows,
    error,
    refused,
    failed,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<ReorderPointRow>(listPath);

  // Beside All, Low and Out, with the search: the rows pressing each shows;
  // silent, so without a count the buttons still work.
  const countsRead = useResource<ReorderPointCounts>(countsPath);
  const counts = countsRead.data;

  const choosable = useMemo(
    () => (rows ?? []).filter((row) => choiceOf(row) === 'open'),
    [rows],
  );
  const chosenHere = choosable.filter((row) => chosen.has(row.variantId));

  const choose = (row: ReorderPointRow, on: boolean) =>
    setChosen((was) => {
      const next = new Map(was);
      if (on) next.set(row.variantId, row);
      else next.delete(row.variantId);
      return next;
    });

  const chooseAll = (on: boolean) =>
    setChosen((was) => {
      const next = new Map(was);
      for (const row of choosable) {
        if (on) next.set(row.variantId, row);
        else next.delete(row.variantId);
      }
      return next;
    });

  const columns = choosing ? 7 : 6;

  /** New order, a line per item at its suggestion; nothing saved yet (ADR-085). */
  const buy = (lines: ReorderPointRow[]) => {
    keepTicks(entry, [...chosen.values()]);
    void navigate('/orders/new', {
      state: fillState({
        lines: lines.map((row) => ({
          variantId: row.variantId,
          quantity: row.suggestion,
        })),
      }),
    });
  };

  const rowProps = (row: ReorderPointRow): RowProps => ({
    row,
    choosing,
    chosen: chosen.has(row.variantId),
    onChoose: choose,
    onBuy: choosing ? (one) => buy([one]) : null,
    onPlan: planner ? setPlanning : null,
    planned: planned === row.variantId,
    actions: setting && (
      <ReorderPointActions
        row={row}
        onEdit={(edited) =>
          setOpening({
            kind: 'edit',
            item: edited,
            point: {
              source: edited.source,
              reorderPoint: edited.reorderPoint,
              rule: edited.rule,
              fixedQuantity: edited.fixedQuantity,
              maximumQuantity: edited.maximumQuantity,
            },
          })
        }
        onRemove={setRemoving}
      />
    ),
  });

  // Most first on its first press, then least first: what a buyer reads
  // first is what to order most of (ADR-093).
  const suggestedHeader = {
    active: sort?.key === 'suggested',
    order: sort?.order ?? 'desc',
    onSort: () =>
      setSort(
        'suggested',
        sort?.key === 'suggested' && sort.order === 'desc' ? 'asc' : 'desc',
      ),
  } as const;

  // No point at all, counted with no search: the views, the position's
  // line and Export have nothing to show, and the empty state says what a
  // point does, with its own Learn more.
  const none = counts?.all === 0 && !search;

  // All, Low stock and Out, each with its count; none while no point is
  // set, which the empty state says.
  const quick = none
    ? []
    : [
        {
          id: 'all',
          // Its own, not Invoices': Toutes is for factures.
          label: intl.formatMessage({
            id: 'inventory.reorder.filter.all',
            defaultMessage: 'All',
          }),
          count: counts?.all,
          pressed: filter === '',
          onToggle: () => setFilter(''),
        },
        {
          id: 'low',
          label: intl.formatMessage({
            id: 'inventory.reorder.filter.low',
            defaultMessage: 'Low stock',
          }),
          count: counts?.low,
          pressed: filter === 'low',
          onToggle: () => setFilter('low'),
        },
        {
          id: 'out',
          label: intl.formatMessage({
            id: 'inventory.reorder.filter.out',
            defaultMessage: 'Out',
          }),
          count: counts?.out,
          pressed: filter === 'out',
          onToggle: () => setFilter('out'),
        },
      ];

  // The sort a phone has no header for, in the Filters sheet (#481).
  const sortField = (
    <TextField
      select
      size="small"
      id="reorder-sort"
      label={intl.formatMessage({
        id: 'products.sort',
        defaultMessage: 'Sort',
      })}
      value={sort ? `${sort.key}:${sort.order}` : 'own'}
      onChange={(event) => {
        if (event.target.value === 'own') clearSort();
        else
          setSort(
            'suggested',
            event.target.value.endsWith('asc') ? 'asc' : 'desc',
          );
      }}
    >
      {(['own', 'suggested:desc', 'suggested:asc'] as const).map((value) => (
        <MenuItem key={value} value={value}>
          {intl.formatMessage(
            {
              id: 'inventory.reorder.sortBy',
              defaultMessage:
                '{value, select, desc {Suggested order, most first} asc {Suggested order, least first} other {Low first}}',
            },
            { value: value === 'own' ? 'own' : value.split(':')[1] },
          )}
        </MenuItem>
      ))}
    </TextField>
  );

  /**
   * After a point is added, changed or removed: the list from its first
   * page and its counts, since its order and its numbers change with the
   * point; and the item off the chosen, whose suggestion is no longer so.
   */
  function saved(variantId?: string) {
    setOpening(null);
    setRemoving(null);
    setPlanning(null);
    reload();
    void countsRead.reload();
    if (variantId)
      setChosen((was) => {
        const next = new Map(was);
        next.delete(variantId);
        return next;
      });
  }

  const add = setting && (
    <Button onClick={openDialog(() => setOpening({ kind: 'add' }))}>
      {intl.formatMessage({
        id: 'inventory.reorder.add',
        defaultMessage: 'Add reorder point',
      })}
    </Button>
  );

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.inventory',
          defaultMessage: 'Inventory',
        })}
        actions={
          <>
            {/* Every row the filter and search match, not the page (ADR-057). */}
            {!none && (
              <ExportButton
                path={withSort(
                  pathOf('/stock/reorder-points/export', query),
                  sort,
                )}
              />
            )}
            {add}
          </>
        }
      />

      {tabs}

      <Stack spacing={1}>
        {/* On a phone, the sort goes in the Filters button's sheet (#481),
            the quick filters under the row. */}
        <FilterRow
          search={{
            label: intl.formatMessage({
              id: 'inventory.search',
              defaultMessage: 'Search',
            }),
            value: text,
            onChange: setText,
          }}
          quick={phone ? [] : quick}
        >
          {phone && !none && (
            <FiltersButton
              on={0}
              shown={null}
              onClear={() => clearSort({ status: null })}
            >
              {sortField}
            </FiltersButton>
          )}
        </FilterRow>
        {phone && (
          <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
            {quick.map((one) => (
              <QuickFilterPill key={one.id} filter={one} />
            ))}
          </Stack>
        )}
        {!none && (
          <Typography variant="body2" sx={{ color: 'text.secondary' }}>
            <LearnMore
              target={{ guide: 'inventory', section: 'position' }}
              variant="inline"
              after={
                choosing
                  ? intl.formatMessage({
                      id: 'inventory.reorder.lineTick',
                      defaultMessage:
                        'Buy or make what is short. Tick several to buy them on one purchase order.',
                    })
                  : intl.formatMessage({
                      id: 'inventory.reorder.line',
                      defaultMessage: 'Buy or make what is short.',
                    })
              }
            />
          </Typography>
        )}
      </Stack>

      <ListError error={error} onRetry={failed ? reload : undefined} />

      {!failed && (
        <Paper variant="outlined">
          {loading || rows?.length ? (
            <TableOrCards
              loading={loading}
              table={
                <TableContainer>
                  <Table size="small">
                    <TableHead>
                      <TableRow>
                        {choosing && (
                          <TableCell padding="checkbox">
                            <Checkbox
                              disabled={!choosable.length}
                              checked={
                                !!choosable.length &&
                                chosenHere.length === choosable.length
                              }
                              indeterminate={
                                chosenHere.length > 0 &&
                                chosenHere.length < choosable.length
                              }
                              onChange={(event) =>
                                chooseAll(event.target.checked)
                              }
                              slotProps={{
                                input: {
                                  'aria-label': intl.formatMessage({
                                    id: 'inventory.reorder.chooseAll',
                                    defaultMessage:
                                      'Choose every item to order',
                                  }),
                                },
                              }}
                            />
                          </TableCell>
                        )}
                        <TableCell>
                          {intl.formatMessage({
                            id: 'inventory.item',
                            defaultMessage: 'Item',
                          })}
                        </TableCell>
                        <TableCell>
                          {intl.formatMessage({
                            id: 'common.status',
                            defaultMessage: 'Status',
                          })}
                        </TableCell>
                        <TableCell>
                          {intl.formatMessage({
                            id: 'products.stock.title',
                            defaultMessage: 'Where it stands',
                          })}
                        </TableCell>
                        <SortHeader
                          align="right"
                          label={intl.formatMessage({
                            id: 'inventory.reorder.suggested',
                            defaultMessage: 'Suggested order',
                          })}
                          {...suggestedHeader}
                        />
                        <TableCell sx={WIDE_ONLY}>
                          {intl.formatMessage({
                            id: 'inventory.reorder.inDraft',
                            defaultMessage: 'In draft',
                          })}
                        </TableCell>
                        {/* Every header named (R6), this one to a screen
                            reader: each row's button says its word. */}
                        <TableCell
                          padding="checkbox"
                          sx={{ position: 'relative' }}
                        >
                          <Box component="span" sx={HIDDEN}>
                            {intl.formatMessage({
                              id: 'common.actions',
                              defaultMessage: 'Actions',
                            })}
                          </Box>
                        </TableCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {loading && (
                        <PlaceholderRows columns={columns} wideOnly={1} />
                      )}
                      {!loading &&
                        rows?.map((row) => (
                          <PointRow
                            key={row.id}
                            columns={columns}
                            {...rowProps(row)}
                          />
                        ))}
                    </TableBody>
                  </Table>
                </TableContainer>
              }
              cards={
                <Stack component="ul" sx={{ m: 0, p: 0 }}>
                  {rows?.map((row) => (
                    <PointCard key={row.id} {...rowProps(row)} />
                  ))}
                </Stack>
              }
            />
          ) : (
            <Nothing
              searched={!!search}
              filter={filter}
              all={counts?.all ?? null}
              add={add}
              onShowAll={() => setFilter('')}
            />
          )}
        </Paper>
      )}

      {!none && !!rows?.length && <Legend />}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />

      {/* How many are chosen, said as it changes (WCAG 4.1.3): here, there
          while choosing is, since the bar comes and goes with what is. */}
      {choosing && (
        <Box role="status" sx={HIDDEN}>
          {chosen.size > 0 &&
            intl.formatMessage(
              {
                id: 'inventory.reorder.chosen',
                defaultMessage: '{count, plural, other {# chosen}}',
              },
              { count: chosen.size },
            )}
        </Box>
      )}
      {choosing && chosen.size > 0 && (
        <ChosenBar
          chosen={[...chosen.values()]}
          onClear={() => setChosen(new Map())}
          // New order, a line per chosen item at its suggestion; nothing is
          // saved until it is raised there, as a draft (ADR-085).
          onRaise={() => buy([...chosen.values()])}
        />
      )}

      {planning && (
        <CreateRunDialog
          open
          canSeePartners={can('partners.view')}
          filled={{
            outputVariantId: planning.variantId,
            quantityPlanned: fieldQuantity(planning.suggestion),
            note: intl.formatMessage(
              {
                id: 'inventory.reorder.runFilled',
                defaultMessage:
                  'Filled from Reorder: {quantity} brings it {rule, select, maximum {up to its maximum, {target}} other {back to its reorder point, {target}}}.',
              },
              {
                quantity: displayQuantity(planning.suggestion),
                rule: planning.rule,
                target: displayQuantity(
                  planning.rule === 'maximum' && planning.maximumQuantity
                    ? planning.maximumQuantity
                    : planning.reorderPoint,
                ),
              },
            ),
          }}
          onClose={() => setPlanning(null)}
          // A draft run is in draft at once: the list and its counts again,
          // and focus on the row's draft once it shows.
          onCreated={() => {
            setPlanned(planning.variantId);
            saved();
          }}
        />
      )}

      {opening && (
        <ReorderPointDialog
          opening={opening}
          onClose={() => setOpening(null)}
          onSaved={() =>
            saved(opening.kind === 'add' ? undefined : opening.item.variantId)
          }
        />
      )}

      {removing && (
        <RemoveReorderPointDialog
          variantId={removing.variantId}
          sku={removing.sku}
          onClose={() => setRemoving(null)}
          onRemoved={() => saved(removing.variantId)}
        />
      )}
    </Stack>
  );
}

/**
 * The list with no rows (ADR-085): nothing matching the search; no point
 * yet, saying what one does, with Add; nothing low, in the positive tone,
 * with how many have a point and Show all; or nothing out.
 */
function Nothing({
  searched,
  filter,
  all,
  add,
  onShowAll,
}: {
  searched: boolean;
  filter: Filter;
  /** Every item with a point, once counted. */
  all: number | null;
  add: ReactNode;
  onShowAll: () => void;
}) {
  const intl = useIntl();

  if (searched) {
    return (
      <EmptyState>
        {intl.formatMessage({
          id: 'inventory.noMatch',
          defaultMessage: 'Nothing matches that search.',
        })}
      </EmptyState>
    );
  }

  if (filter === '' || all === 0) {
    return (
      <EmptyState
        action={add}
        learnMore={{ guide: 'inventory', section: 'reorder-points' }}
      >
        <Box component="span" sx={{ display: 'flex', gap: 1.5 }}>
          <Inventory2Outlined aria-hidden sx={{ color: 'text.secondary' }} />
          <span>
            <Box component="span" sx={{ display: 'block', fontWeight: 600 }}>
              {intl.formatMessage({
                id: 'inventory.reorder.none',
                defaultMessage: 'No reorder points yet.',
              })}
            </Box>
            {intl.formatMessage({
              id: 'inventory.reorder.noneLine',
              defaultMessage:
                'A reorder point says when an item runs short: below it, the item shows as low here, on Home and in the bell, with what to order.',
            })}
          </span>
        </Box>
      </EmptyState>
    );
  }

  if (filter === 'low') {
    return (
      <EmptyState
        action={
          <Button variant="outlined" onClick={onShowAll}>
            {intl.formatMessage({
              id: 'inventory.reorder.showAll',
              defaultMessage: 'Show all',
            })}
          </Button>
        }
      >
        <Box
          component="span"
          sx={{ display: 'flex', gap: 1, alignItems: 'center' }}
        >
          <CheckCircleOutlined aria-hidden sx={{ color: 'success.main' }} />
          {all === null
            ? intl.formatMessage({
                id: 'inventory.reorder.nothingLow',
                defaultMessage: 'Nothing is low.',
              })
            : intl.formatMessage(
                {
                  id: 'inventory.reorder.nothingLowOf',
                  defaultMessage:
                    '{count, plural, one {Nothing is low. # item has a reorder point.} other {Nothing is low. # items have a reorder point.}}',
                },
                { count: all },
              )}
        </Box>
      </EmptyState>
    );
  }

  return (
    <EmptyState>
      {intl.formatMessage({
        id: 'inventory.reorder.nothingOut',
        defaultMessage: 'Nothing is out.',
      })}
    </EmptyState>
  );
}
