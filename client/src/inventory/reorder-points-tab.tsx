import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import KeyboardArrowDown from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUp from '@mui/icons-material/KeyboardArrowUp';
import WarningAmberOutlined from '@mui/icons-material/WarningAmberOutlined';
import {
  Box,
  Button,
  Checkbox,
  IconButton,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  type ReactElement,
  type ReactNode,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useSearchParams } from 'react-router-dom';

import type { ReorderPointCounts, ReorderPointRow } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { fromAddress } from '../lib/address-filter';
import { api } from '../lib/api';
import type { ReorderStatus } from '../lib/api-names';
import { displayQuantity, itemName, NO_VALUE } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch } from '../lib/use-list-search';
import { displayWithUnit } from '../products/units';
import { rem } from '../theme/rem';
import { STATUS_TONES } from '../theme/status';
import { DraftLines, ReorderPointDetail } from './reorder-point-detail';
import { atOrBelowZero, barFill, choiceOf } from './reorder-points';

/** A page of the list (ADR-051), as the server's own default. */
const PAGE_SIZE = 50;

/** The list's three views (ADR-085): '' is All; Low holds the out too. */
const FILTERS = ['', 'low', 'out'] as const;
type Filter = (typeof FILTERS)[number];

/** Each status's icon beside its word, so it is never told by colour alone. */
const STATUS_ICONS: Partial<Record<ReorderStatus, ReactElement>> = {
  out: <ErrorOutlined />,
  low: <WarningAmberOutlined />,
  enough: <CheckCircleOutlined />,
};

/** A path on the list's routes, its filter and search added. */
function pathOf(base: string, query: Record<string, string>): string {
  const params = new URLSearchParams(
    Object.entries(query).filter(([, value]) => value !== ''),
  );
  const text = params.toString();
  return text ? `${base}?${text}` : base;
}

/**
 * The bar beside a position (ADR-085): its scale twice the point, so the
 * mark in the middle is the point. Filled amber when low, green when not;
 * empty and outlined red when out. Hidden from screen readers, since the
 * number beside it says it.
 */
function PositionBar({ row }: { row: ReorderPointRow }) {
  const out = row.status === 'out';

  return (
    <Box
      aria-hidden
      sx={{
        position: 'relative',
        width: rem(120),
        height: 8,
        borderRadius: 999,
        bgcolor: 'action.hover',
        ...(out && { outline: 1, outlineColor: 'error.main' }),
      }}
    >
      <Box
        sx={{
          width: `${barFill(row.position, row.reorderPoint)}%`,
          height: '100%',
          borderRadius: 999,
          bgcolor: row.status === 'low' ? 'warning.main' : 'success.main',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          left: '50%',
          top: -3,
          bottom: -3,
          width: 2,
          bgcolor: 'text.primary',
        }}
      />
    </Box>
  );
}

/** What a row's item is: bought or made, and how much its rule orders. */
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
            id: 'inventory.reorder.kind',
            defaultMessage:
              '{source, select, made {Made} other {Bought}} · {rule, select, fixed {{quantity} at a time} maximum {up to {quantity}} other {just enough}}',
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

/** The suggested order, or Drafted with what is in draft, linked. */
function Suggestion({ row }: { row: ReorderPointRow }) {
  const intl = useIntl();

  if (row.drafted) {
    return (
      <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
        <Typography variant="body2" component="span">
          {intl.formatMessage({
            id: 'inventory.reorder.drafted',
            defaultMessage: 'Drafted',
          })}
        </Typography>
        <Box sx={{ minWidth: rem(160) }}>
          <DraftLines drafts={row.drafts} />
        </Box>
      </Stack>
    );
  }

  if (row.status === 'discontinued' || atOrBelowZero(row.suggestion)) {
    return NO_VALUE;
  }

  return (
    <Stack spacing={0.25} sx={{ alignItems: 'flex-end' }}>
      <span>{displayQuantity(row.suggestion)}</span>
      {row.rule === 'fixed' && row.suggestedMultiples && row.fixedQuantity && (
        <Typography variant="caption" sx={{ color: 'text.secondary' }}>
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

/** A row of the list, and under it, once opened, where it stands. */
function PointRow({
  row,
  columns,
  choosing,
  chosen,
  onChoose,
}: {
  row: ReorderPointRow;
  columns: number;
  /** Whether this reader may choose rows to order (orders.create). */
  choosing: boolean;
  chosen: boolean;
  onChoose: (row: ReorderPointRow, on: boolean) => void;
}) {
  const intl = useIntl();
  const kindLine = useKindLine();
  const [open, setOpen] = useState(false);
  const choice = choiceOf(row);
  const grey = row.status === 'discontinued';
  const detailId = `reorder-detail-${row.id}`;

  const drafted = intl.formatMessage(
    {
      id: 'inventory.reorder.chooseDrafted',
      defaultMessage:
        '{sku} is in a draft already, which covers what it needs.',
    },
    { sku: row.sku },
  );
  const box =
    choice === 'open' ? (
      <Checkbox
        checked={chosen}
        onChange={(event) => onChoose(row, event.target.checked)}
        slotProps={{
          input: {
            'aria-label': intl.formatMessage(
              {
                id: 'inventory.reorder.choose',
                defaultMessage: 'Choose {sku}',
              },
              { sku: row.sku },
            ),
          },
        }}
      />
    ) : choice === 'drafted' ? (
      // A disabled box takes no pointer, so its reason is on what holds it.
      <Tooltip title={drafted}>
        <span>
          <Checkbox disabled slotProps={{ input: { 'aria-label': drafted } }} />
        </span>
      </Tooltip>
    ) : null;

  return (
    <>
      <TableRow
        hover
        sx={{
          '& > td': {
            ...(open && { borderBottom: 0 }),
            ...(grey && { color: 'text.secondary' }),
          },
        }}
      >
        {choosing && <TableCell padding="checkbox">{box}</TableCell>}
        <TableCell>
          <Stack spacing={0.25}>
            <span>
              {intl.formatMessage(
                {
                  id: 'inventory.reorder.item',
                  defaultMessage: '{sku} {name}',
                },
                {
                  sku: (
                    <Box component="span" sx={{ fontWeight: 600 }}>
                      {row.sku}
                    </Box>
                  ),
                  name: itemName(row.productName, row.variantName),
                },
              )}
            </span>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>
              {kindLine(row)}
            </Typography>
          </Stack>
        </TableCell>
        <TableCell>
          <StatusChip
            tone={STATUS_TONES.reorder[row.status]}
            icon={STATUS_ICONS[row.status]}
            label={intl.formatMessage(
              {
                id: 'inventory.reorder.status',
                defaultMessage:
                  '{status, select, out {Out} low {Low} enough {Enough} other {Discontinued}}',
              },
              { status: row.status },
            )}
          />
        </TableCell>
        <TableCell
          align="right"
          sx={{
            fontWeight: 600,
            whiteSpace: 'nowrap',
            ...(!grey &&
              atOrBelowZero(row.position) && { color: 'error.main' }),
          }}
        >
          {displayWithUnit(row.position, row.unitOfMeasure, intl)}
        </TableCell>
        <TableCell>{!grey && <PositionBar row={row} />}</TableCell>
        <TableCell align="right">{displayQuantity(row.reorderPoint)}</TableCell>
        <TableCell align="right">
          <Suggestion row={row} />
        </TableCell>
        <TableCell padding="checkbox">
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
        </TableCell>
      </TableRow>
      {open && (
        <TableRow id={detailId}>
          <TableCell colSpan={columns} sx={{ pt: 0 }}>
            <ReorderPointDetail row={row} />
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

/**
 * The chosen rows, floating at the foot of the list while any is chosen
 * (ADR-085): how many, each with its suggestion, and Clear. What they are
 * chosen for, a purchase order, comes with New order filled in.
 */
function ChosenBar({
  chosen,
  onClear,
}: {
  chosen: ReorderPointRow[];
  onClear: () => void;
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
                  id: 'inventory.reorder.chosenItem',
                  defaultMessage: '{sku} · {quantity}',
                },
                { sku: row.sku, quantity: displayQuantity(row.suggestion) },
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
      </Stack>
    </Paper>
  );
}

/**
 * Inventory's Reorder points (ADR-085): every item with a point and where
 * it stands, low first, as the server orders it. All, Low and Out with
 * their counts from the server; the search, as every list's (ADR-056);
 * each row opened to where its position comes from; bought low rows
 * chosen for a purchase order by someone who may raise one. The figures
 * are the server's, never added up here (ADR-025).
 *
 * Home's card and the bell open it on Low: `?tab=reorder-points&status=low`.
 */
export function ReorderPointsTab({ tabs }: { tabs: ReactNode }) {
  const intl = useIntl();
  const can = useCan();
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() =>
    fromAddress<Filter>(params, 'status', FILTERS, ''),
  );
  const { text, setText, search } = useListSearch();
  const [counts, setCounts] = useState<ReorderPointCounts | null>(null);
  // By item, kept while the filter or the search changes, so a buyer can
  // find items one search at a time and order them together.
  const [chosen, setChosen] = useState<Map<string, ReorderPointRow>>(
    () => new Map(),
  );

  const choosing = can('orders.create');
  const query = { status: filter, search };
  const listPath = pathOf('/stock/reorder-points', {
    ...query,
    limit: String(PAGE_SIZE),
  });
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
  const showSkeleton = useDelayedFlag(loading);

  // Beside All, Low and Out, with the search: the rows pressing each shows.
  useEffect(() => {
    let ignore = false;
    void api<ReorderPointCounts>(countsPath)
      .then((read) => {
        if (!ignore) setCounts(read);
      })
      // Silent: without a count the buttons still work.
      .catch(() => undefined);
    return () => {
      ignore = true;
    };
  }, [countsPath]);

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

  const columns = choosing ? 8 : 7;

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
          // Every row the filter and search match, not the page (ADR-057).
          <ExportButton path={pathOf('/stock/reorder-points/export', query)} />
        }
      />

      {tabs}

      <Stack spacing={1}>
        <FilterRow
          search={{
            label: intl.formatMessage({
              id: 'inventory.search',
              defaultMessage: 'Search',
            }),
            value: text,
            onChange: setText,
          }}
          quick={[
            {
              id: 'all',
              label: intl.formatMessage({
                id: 'invoices.filter.all',
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
                defaultMessage: 'Low',
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
          ]}
        />
        <Typography variant="body2" sx={{ color: 'text.secondary' }}>
          {intl.formatMessage({
            id: 'inventory.reorder.positionLine',
            defaultMessage: 'Position = usable + coming − still needed',
          })}
        </Typography>
      </Stack>

      <ListError error={error} onRetry={failed ? reload : undefined} />

      {!failed && (
        <Paper variant="outlined">
          {loading ? (
            <Stack sx={{ p: 2 }} spacing={1}>
              {showSkeleton ? (
                <>
                  <Skeleton height={48} />
                  <Skeleton height={48} />
                </>
              ) : null}
            </Stack>
          ) : rows?.length ? (
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
                          onChange={(event) => chooseAll(event.target.checked)}
                          slotProps={{
                            input: {
                              'aria-label': intl.formatMessage({
                                id: 'inventory.reorder.chooseAll',
                                defaultMessage: 'Choose every item to order',
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
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.reorder.position',
                        defaultMessage: 'Position',
                      })}
                    </TableCell>
                    {/* The bar's column: the number beside it is its name. */}
                    <TableCell />
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.reorder.point',
                        defaultMessage: 'Reorder point',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'inventory.reorder.suggested',
                        defaultMessage: 'Suggested order',
                      })}
                    </TableCell>
                    {/* The row's buttons; a column of them has no name worth reading out. */}
                    <TableCell padding="checkbox" />
                  </TableRow>
                </TableHead>
                <TableBody>
                  {rows.map((row) => (
                    <PointRow
                      key={row.id}
                      row={row}
                      columns={columns}
                      choosing={choosing}
                      chosen={chosen.has(row.variantId)}
                      onChoose={choose}
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            <EmptyState>
              {search
                ? intl.formatMessage({
                    id: 'inventory.noMatch',
                    defaultMessage: 'Nothing matches that search.',
                  })
                : filter === 'out'
                  ? intl.formatMessage({
                      id: 'inventory.reorder.nothingOut',
                      defaultMessage: 'Nothing is out.',
                    })
                  : filter === 'low'
                    ? intl.formatMessage({
                        id: 'inventory.reorder.nothingLow',
                        defaultMessage: 'Nothing is low.',
                      })
                    : intl.formatMessage({
                        id: 'inventory.reorder.none',
                        defaultMessage: 'No reorder points yet.',
                      })}
            </EmptyState>
          )}
        </Paper>
      )}

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />

      {choosing && chosen.size > 0 && (
        <ChosenBar
          chosen={[...chosen.values()]}
          onClear={() => setChosen(new Map())}
        />
      )}
    </Stack>
  );
}
