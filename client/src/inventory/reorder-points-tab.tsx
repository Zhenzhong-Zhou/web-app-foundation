import CheckCircleOutlined from '@mui/icons-material/CheckCircleOutlined';
import ErrorOutlined from '@mui/icons-material/ErrorOutlined';
import Inventory2Outlined from '@mui/icons-material/Inventory2Outlined';
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
  useRef,
  useState,
} from 'react';
import { useIntl } from 'react-intl';
import { useNavigate, useSearchParams } from 'react-router-dom';

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
import { LearnMore } from '../help/learn-more';
import { fromAddress } from '../lib/address-filter';
import { api } from '../lib/api';
import type { ReorderStatus } from '../lib/api-names';
import { displayQuantity, itemName, NO_VALUE } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch } from '../lib/use-list-search';
import { fillState } from '../orders/order-fill';
import { CreateRunDialog } from '../production/create-run-dialog';
import { displayWithUnit } from '../products/units';
import { rem } from '../theme/rem';
import { STATUS_TONES } from '../theme/status';
import { PositionBar } from './position-bar';
import { RemoveReorderPointDialog } from './remove-reorder-point-dialog';
import { ReorderPointActions } from './reorder-point-actions';
import { DraftLines, ReorderPointDetail } from './reorder-point-detail';
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

/**
 * The suggested order, or Drafted with what is in draft, linked. With
 * `focused`, its first link takes focus once drafted, or Drafted itself
 * for a reader who cannot open the run: a run just planned from the row,
 * whose Plan a run is gone, so focus does not fall to the page's start
 * (WCAG 2.4.3).
 */
function Suggestion({
  row,
  focused = false,
}: {
  row: ReorderPointRow;
  focused?: boolean;
}) {
  const intl = useIntl();
  const draftsRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!focused || !row.drafted) return;
    const drafts = draftsRef.current;
    (drafts?.querySelector('a') ?? drafts)?.focus();
  }, [focused, row.drafted]);

  if (row.drafted) {
    return (
      <Stack
        ref={draftsRef}
        tabIndex={focused ? -1 : undefined}
        spacing={0.25}
        sx={{ alignItems: 'flex-end' }}
      >
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
  onPlan,
  planned,
  actions,
}: {
  row: ReorderPointRow;
  columns: number;
  /** Whether this reader may choose rows to order (orders.create). */
  choosing: boolean;
  chosen: boolean;
  onChoose: (row: ReorderPointRow, on: boolean) => void;
  /** Plan a run of a made low item, for whoever may (production.create). */
  onPlan: ((row: ReorderPointRow) => void) | null;
  /** Its run was just planned here: its draft's link takes focus. */
  planned: boolean;
  /** The row's menu, for whoever may set a point (stock.reorder). */
  actions: ReactNode;
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
        <TableCell>
          {!grey && (
            <PositionBar
              position={row.position}
              point={row.reorderPoint}
              status={row.status}
            />
          )}
        </TableCell>
        <TableCell align="right">{displayQuantity(row.reorderPoint)}</TableCell>
        <TableCell align="right">
          <Suggestion row={row} focused={planned} />
        </TableCell>
        <TableCell padding="checkbox">
          {/* Apart, so each is a target of its own (WCAG 2.5.8). */}
          <Stack
            direction="row"
            spacing={1}
            sx={{ justifyContent: 'flex-end', alignItems: 'center' }}
          >
            {onPlan && plansRun(row) && (
              <Button
                variant="outlined"
                size="small"
                sx={{ whiteSpace: 'nowrap' }}
                aria-label={intl.formatMessage(
                  {
                    id: 'inventory.reorder.planRun',
                    defaultMessage: 'Plan a run of {sku}',
                  },
                  { sku: row.sku },
                )}
                onClick={openDialog(() => onPlan(row))}
              >
                {intl.formatMessage({
                  id: 'production.plan',
                  defaultMessage: 'Plan a run',
                })}
              </Button>
            )}
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
 * (ADR-085): how many, each with its suggestion, Clear, and Raise a
 * purchase order, which opens New order filled in with them.
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
        <Button onClick={onRaise}>
          {intl.formatMessage({
            id: 'inventory.reorder.raise',
            defaultMessage: 'Raise a purchase order',
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
 * Whoever may set a point (stock.reorder) adds one at the title's right,
 * and edits or removes it from its row's menu; the list and its counts
 * read again after each.
 *
 * Home's card and the bell open it on Low: `?tab=reorder-points&status=low`.
 */
export function ReorderPointsTab({ tabs }: { tabs: ReactNode }) {
  const intl = useIntl();
  const can = useCan();
  const navigate = useNavigate();
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
  const [opening, setOpening] = useState<ReorderOpening | null>(null);
  const [removing, setRemoving] = useState<ReorderPointRow | null>(null);
  const [planning, setPlanning] = useState<ReorderPointRow | null>(null);
  /** The item whose run was just planned from its row. */
  const [planned, setPlanned] = useState<string | null>(null);
  /** Bumped by each save and removal, so the counts read again too. */
  const [changes, setChanges] = useState(0);

  const choosing = can('orders.create');
  const setting = can('stock.reorder');
  const planner = can('production.create');
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
  }, [countsPath, changes]);

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
    setChanges((count) => count + 1);
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
            <ExportButton
              path={pathOf('/stock/reorder-points/export', query)}
            />
            {add}
          </>
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
          <LearnMore
            target={{ guide: 'inventory', section: 'position' }}
            variant="inline"
            after={intl.formatMessage({
              id: 'inventory.reorder.positionLine',
              defaultMessage: 'Position = usable + coming − still needed',
            })}
          />
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
                      onPlan={planner ? setPlanning : null}
                      planned={planned === row.variantId}
                      actions={
                        setting && (
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
                        )
                      }
                    />
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
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

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />

      {choosing && chosen.size > 0 && (
        <ChosenBar
          chosen={[...chosen.values()]}
          onClear={() => setChosen(new Map())}
          // New order, a line per chosen item at its suggestion; nothing is
          // saved until it is raised there, as a draft (ADR-085).
          onRaise={() =>
            void navigate('/orders/new', {
              state: fillState({
                lines: [...chosen.values()].map((row) => ({
                  variantId: row.variantId,
                  quantity: row.suggestion,
                })),
              }),
            })
          }
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
                  'Filled from Reorder points: {quantity} brings it {rule, select, maximum {up to its maximum, {target}} other {back to its reorder point, {target}}}.',
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
