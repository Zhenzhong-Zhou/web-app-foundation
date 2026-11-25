import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import type {
  NeedsCostEntry,
  StockValuationTotals,
  ValuationPool,
} from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { ActionsHeader } from '../components/actions-header';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { ListTable } from '../components/list-table';
import { LoadMoreButton } from '../components/load-more-button';
import { LotLink } from '../components/lot-link';
import { NAME_COLUMN } from '../components/name-column';
import { NUMBER_COLUMN } from '../components/number-column';
import { PageHeader } from '../components/page-header';
import { PlaceholderRows } from '../components/placeholder-rows';
import { ShowingLine } from '../components/showing-line';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { LearnMore } from '../help/learn-more';
import { FormerCodeLine } from '../inventory/lot-marks';
import { withQuery } from '../lib/api';
import type { ValuationSort } from '../lib/api-names';
import {
  displayQuantity,
  formatDate,
  formatMoney,
  formatUnitCost,
  itemName,
  NO_VALUE,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useArrival } from '../lib/use-arrival';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch } from '../lib/use-list-search';
import { type ListSort, useListSort } from '../lib/use-list-sort';
import { useResource } from '../lib/use-resource';
import { useRowReturn } from '../lib/use-row-return';
import { NameAndCode } from '../products/name-and-code';
import { SetCostDialog } from './set-cost-dialog';

/**
 * The address's `#costs`, Help's id for its section on giving stock its
 * cost: the page opens at its list of what waits, as Home's Waiting for a
 * cost tile does (ADR-091; #505's 8).
 */
const WAITING_HASH = '#costs';

/**
 * How many pools a page holds, asked for so Show 50 more says what it
 * reads (ADR-094's amendment, R6).
 */
const PAGE_SIZE = 50;

/**
 * The one column a header sorts by in the address, the value; the item's
 * order is the list's own, with no sort written (ADR-094's amendment, R6).
 */
const SORTS = ['value'] as const;

/**
 * The server's name for the order the address holds: the largest value
 * first is `-value`, the smallest `value`; by the item, none (R6).
 */
function servedSort(
  sort: ListSort<(typeof SORTS)[number]> | null,
): ValuationSort | undefined {
  if (!sort) return undefined;
  return sort.order === 'desc' ? '-value' : 'value';
}

/** A pool's own key, its variant and its lot, for its row and for Back. */
const poolKey = (pool: ValuationPool) =>
  `${pool.variantId}:${pool.lotId ?? ''}`;

/** Why a row is waiting, in the words someone would fix it by. */
const WHY = defineMessages({
  opening: {
    id: 'costs.why.opening',
    defaultMessage: 'On hand when valuation began',
  },
  production: {
    id: 'costs.why.production',
    defaultMessage: 'Made by a run that is still open',
  },
  adjustment: {
    id: 'costs.why.adjustment',
    defaultMessage: 'Counted in, with nothing to value it by',
  },
  noPrice: {
    id: 'costs.why.noPrice',
    defaultMessage: 'Received with no price',
  },
  fromBefore: {
    id: 'costs.why.fromBefore',
    defaultMessage: 'Back from before lot tracking',
  },
  waiting: { id: 'costs.needsCost', defaultMessage: 'Waiting for a cost' },
});

/**
 * Why a row waits, in the words someone would fix it by. A kind or a
 * reason this tab does not know says only that it waits, never a known
 * case's words (ADR-094, D4): a tab opened before the next kind is added
 * reads it so.
 */
function whyWaiting(entry: NeedsCostEntry, intl: IntlShape): ReactNode {
  if (entry.kind === 'opening') return intl.formatMessage(WHY.opening);
  if (entry.kind === 'lot_change') {
    // Its cost is the first lot's, and follows from there (D5).
    return entry.fromLotId && entry.fromLotCode ? (
      <FormattedMessage
        id="costs.why.movedIn"
        defaultMessage="Moved in from lot {code}. Its cost follows that lot’s."
        values={{
          code: (
            <LotLink
              id={entry.fromLotId}
              code={entry.fromLotCode}
              underline="always"
            />
          ),
        }}
      />
    ) : (
      intl.formatMessage(WHY.fromBefore)
    );
  }
  if (entry.kind !== 'movement') return intl.formatMessage(WHY.waiting);
  if (entry.reason === 'production') return intl.formatMessage(WHY.production);
  if (entry.reason === 'adjustment') return intl.formatMessage(WHY.adjustment);
  if (entry.reason !== 'receipt') return intl.formatMessage(WHY.waiting);
  if (entry.unitPrice && entry.currency) {
    // Written here rather than in WHY: a descriptor from defineMessages is
    // typed as taking no values.
    return intl.formatMessage(
      {
        id: 'costs.why.noRate',
        defaultMessage: 'Priced in {currency}, with no rate on file',
      },
      { currency: entry.currency },
    );
  }
  return intl.formatMessage(WHY.noPrice);
}

/**
 * What the stock on hand is worth, and what is still waiting for a cost
 * (ADR-048).
 *
 * The waiting list comes first, because it is the one with something to do:
 * every figure below it that depends on one of those rows is marked
 * provisional until it is cleared.
 *
 * By item and lot reads fifty pools at a time, found and sorted by the
 * server; the total above is every pool's, never the rows shown, a read
 * of its own beside the list, and the export is the way to read them all
 * at once (ADR-094's amendment, R6).
 */
export function StockValuePage() {
  const intl = useIntl();
  const can = useCan();
  const { key: entry } = useLocation();

  // The pools fifty at a time, found and sorted by the server, the find
  // and the sort kept in the address (ADR-094's amendment, R6).
  const { text, setText, search } = useListSearch();
  const { sort, set: setSort, clear: clearSort } = useListSort(SORTS);
  const path = withQuery('/costs/valuation', {
    limit: String(PAGE_SIZE),
    search: search || undefined,
    sort: servedSort(sort),
  });
  // The rows shown kept for Back, which reads them again (#473).
  const pools = useKeysetList<ValuationPool>(path, {
    cursor: 'cursor',
    keep: entry,
  });
  const { rowReturn } = useRowReturn();

  /**
   * The totals, a read of their own keyed by the find (R6): how many the
   * find matches, for this find alone; the total, Provisional and the
   * currency, every pool's whatever is found, the last answer's, kept
   * while another find's are on their way, so the total stays as it
   * was. Show 50 more and a sort never ask them again.
   */
  const totals = useResource<StockValuationTotals>(
    withQuery('/costs/valuation/totals', { search: search || undefined }),
  );
  const [known, setKnown] = useState<StockValuationTotals | null>(null);
  if (totals.data && totals.data !== known) setKnown(totals.data);

  // A page at a time, with Load more, by the hook every list shares (#33).
  const waiting = useKeysetList<NeedsCostEntry>('/costs/needs-cost');
  const refused = pools.refused ?? waiting.refused ?? totals.refused;
  const [costing, setCosting] = useState<NeedsCostEntry | null>(null);
  const waitingSection = useRef<HTMLDivElement>(null);
  const waitingHeading = useRef<HTMLHeadingElement>(null);

  // The page waits for its first reads alone: a find or a sort after
  // reads the pools again under their table's head, the find box kept.
  const loading =
    (waiting.loading ||
      (known === null && (pools.loading || totals.data === null))) &&
    waiting.error === null &&
    pools.error === null &&
    totals.error === null;
  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('costs.update');

  // Opened at what waits: once it has loaded, its list, its heading
  // focused; never again on a read after a cost is set.
  useArrival(WAITING_HASH, !loading, waitingSection, waitingHeading);

  // Show 50 more: focus on the first new row once it is there, as Items
  // does.
  const firstNewRef = useRef<HTMLAnchorElement>(null);
  const [firstNew, setFirstNew] = useState<number | null>(null);
  const shown = pools.entries?.length ?? 0;
  useEffect(() => {
    if (firstNew !== null && shown > firstNew) firstNewRef.current?.focus();
  }, [firstNew, shown]);
  const showMore = () => {
    setFirstNew(shown);
    void pools.loadMore();
  };
  // Another find or sort starts with no row to focus.
  const [readFor, setReadFor] = useState(path);
  if (readFor !== path) {
    setReadFor(path);
    setFirstNew(null);
  }

  /** The pools' first page again, and their totals with it. */
  function reloadPools() {
    pools.reload();
    void totals.reload();
  }

  /** Every read again, after a cost is set or a refusal's Try again. */
  function load() {
    waiting.reload();
    reloadPools();
  }

  const currency = known?.currency ?? null;
  const valueSorted = sort !== null;

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={load} />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.menu.stockValue',
          defaultMessage: 'Stock value',
        })}
        subtitle={
          <LearnMore
            target={{ guide: 'stock-value', section: 'costs' }}
            variant="beside"
            after={intl.formatMessage({
              id: 'costs.intro',
              defaultMessage:
                'Each lot carries what it cost; stock without lots carries a running average. Values are material cost only — what was bought and what went into a batch — in the base currency.',
            })}
          />
        }
        actions={<ExportButton path="/costs/valuation/export" />}
      />

      {waiting.error && <Alert severity="error">{waiting.error}</Alert>}
      {totals.error && <Alert severity="error">{totals.error}</Alert>}

      {known && !currency && (
        <Alert severity="info">
          <FormattedMessage
            id="costs.noBaseCurrency"
            defaultMessage="No base currency yet, so nothing can be valued. Set one on the <link>Organization</link> page."
            values={{
              link: (chunks: ReactNode[]) => (
                <Link
                  underline="always"
                  component={RouterLink}
                  to="/settings/organization?tab=money"
                  state={OFFER_BACK}
                >
                  {chunks}
                </Link>
              ),
            }}
          />
        </Alert>
      )}

      {loading ? (
        showSkeleton ? (
          <Skeleton variant="rounded" height={240} />
        ) : null
      ) : (
        <>
          <Paper variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
              <Typography variant="subtitle1" component="h2">
                {intl.formatMessage({
                  id: 'common.onHand',
                  defaultMessage: 'On hand',
                })}
              </Typography>
              <Typography variant="h6" component="p">
                {formatMoney(known?.total ?? null, currency)}
              </Typography>
              {known?.provisional && (
                <StatusChip
                  tone="warning"
                  label={intl.formatMessage({
                    id: 'costs.provisional',
                    defaultMessage: 'Provisional',
                  })}
                />
              )}
            </Stack>
          </Paper>

          <Paper ref={waitingSection} variant="outlined">
            <Typography
              ref={waitingHeading}
              variant="subtitle1"
              component="h2"
              tabIndex={-1}
              sx={{ p: 2 }}
            >
              {intl.formatMessage({
                id: 'costs.waiting',
                defaultMessage: 'Waiting for a cost',
              })}
            </Typography>

            {waiting.entries?.length === 0 ? (
              <Alert severity="success">
                {intl.formatMessage({
                  id: 'costs.allCosted',
                  defaultMessage: 'Everything on hand has a cost.',
                })}
              </Alert>
            ) : (
              <ListTable
                label={intl.formatMessage({
                  id: 'costs.waiting',
                  defaultMessage: 'Waiting for a cost',
                })}
                size="small"
              >
                <TableHead>
                  <TableRow>
                    <TableCell {...NAME_COLUMN}>
                      {intl.formatMessage({
                        id: 'inventory.item',
                        defaultMessage: 'Item',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.lot',
                        defaultMessage: 'Lot',
                      })}
                    </TableCell>
                    <TableCell {...NUMBER_COLUMN}>
                      {intl.formatMessage({
                        id: 'inventory.quantity',
                        defaultMessage: 'Quantity',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.why',
                        defaultMessage: 'Why',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'costs.since',
                        defaultMessage: 'Since',
                      })}
                    </TableCell>
                    <ActionsHeader align="right" />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {waiting.entries?.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell>
                        {/* The name first, its code grey, as every list
                            of items reads (#296; the design language's
                            Rows). */}
                        <NameAndCode
                          name={itemName(entry.productName, entry.variantName)}
                          code={entry.sku}
                          type={entry.type}
                          coverFileId={entry.coverFileId}
                          to={`/items/${entry.productId}`}
                        />
                      </TableCell>
                      <TableCell>
                        {entry.lotId && entry.lotCode ? (
                          <LotLink id={entry.lotId} code={entry.lotCode} />
                        ) : (
                          NO_VALUE
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {displayQuantity(entry.quantity)}
                      </TableCell>
                      <TableCell>{whyWaiting(entry, intl)}</TableCell>
                      <TableCell>{formatDate(entry.createdAt)}</TableCell>
                      <TableCell align="right">
                        {entry.reason === 'production' && entry.referenceId ? (
                          <Button
                            variant="text"
                            size="small"
                            component={RouterLink}
                            to={`/production/${entry.referenceId}`}
                          >
                            {intl.formatMessage({
                              id: 'costs.openRun',
                              defaultMessage: 'Open run',
                            })}
                          </Button>
                        ) : (
                          // Which rows take a cost is the server's to say,
                          // so this page keeps no copy of the rule (#669's
                          // 58): a batch's output waits for its run, stock
                          // moved in for its first lot's cost.
                          canUpdate &&
                          currency &&
                          entry.takesCost && (
                            <Button
                              variant="text"
                              size="small"
                              onClick={openDialog(() => setCosting(entry))}
                            >
                              {intl.formatMessage({
                                id: 'costs.set.title',
                                defaultMessage: 'Set cost',
                              })}
                            </Button>
                          )
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </ListTable>
            )}

            <LoadMoreButton
              hasMore={waiting.hasMore}
              loading={waiting.loadingMore}
              onLoadMore={waiting.loadMore}
              sx={{ p: 2 }}
            />
          </Paper>

          <Paper variant="outlined">
            <Typography variant="subtitle1" component="h2" sx={{ p: 2 }}>
              {intl.formatMessage({
                id: 'costs.byItemAndLot',
                defaultMessage: 'By item and lot',
              })}
            </Typography>

            <Box sx={{ px: 2, pb: 2 }}>
              <FilterRow
                search={{
                  label: intl.formatMessage({
                    id: 'costs.find',
                    defaultMessage: 'Find an item or a lot',
                  }),
                  value: text,
                  onChange: setText,
                }}
              >
                {/* Beside the find, how many it matches of every pool,
                    from the totals' read for this find (R6). */}
                {search && totals.data && (
                  <Typography
                    role="status"
                    variant="body2"
                    sx={{ color: 'text.secondary' }}
                  >
                    {intl.formatMessage(
                      {
                        id: 'costs.findMatches',
                        defaultMessage:
                          '{count, number} of {pools, number} match',
                      },
                      { count: totals.data.count, pools: totals.data.pools },
                    )}
                  </Typography>
                )}
              </FilterRow>
            </Box>

            {/* The pools' part alone says it could not be read, with Try
                again; the total and the find box stay. */}
            {pools.failed ? (
              <ListError error={pools.error} onRetry={reloadPools} />
            ) : pools.entries?.length === 0 ? (
              search ? (
                <EmptyState
                  action={
                    <Button variant="outlined" onClick={() => setText('')}>
                      {intl.formatMessage({
                        id: 'costs.clearSearch',
                        defaultMessage: 'Clear the search',
                      })}
                    </Button>
                  }
                >
                  {intl.formatMessage(
                    {
                      id: 'costs.noMatch',
                      defaultMessage: 'Nothing matches “{search}”.',
                    },
                    { search },
                  )}
                </EmptyState>
              ) : (
                <Alert severity="info">
                  {intl.formatMessage({
                    id: 'costs.nothingOnHand',
                    defaultMessage: 'Nothing on hand.',
                  })}
                </Alert>
              )
            ) : (
              <ListTable
                label={intl.formatMessage({
                  id: 'costs.byItemAndLot',
                  defaultMessage: 'By item and lot',
                })}
                size="small"
              >
                <TableHead>
                  <TableRow>
                    {/* The item's order is the list's own, one way, so
                        its header puts it back after a sort by value
                        (R6's "the order before"), and pressed in that
                        order changes nothing. */}
                    <SortHeader
                      name
                      label={intl.formatMessage({
                        id: 'inventory.item',
                        defaultMessage: 'Item',
                      })}
                      active={!valueSorted}
                      order="asc"
                      onSort={() => {
                        if (valueSorted) clearSort();
                      }}
                      atRest
                    />
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.lot',
                        defaultMessage: 'Lot',
                      })}
                    </TableCell>
                    <TableCell {...NUMBER_COLUMN}>
                      {intl.formatMessage({
                        id: 'inventory.quantity',
                        defaultMessage: 'Quantity',
                      })}
                    </TableCell>
                    <TableCell {...NUMBER_COLUMN}>
                      {intl.formatMessage({
                        id: 'costs.unitCost',
                        defaultMessage: 'Unit cost',
                      })}
                    </TableCell>
                    {/* The largest first, then the smallest (the board's
                        sort). */}
                    <SortHeader
                      number
                      label={intl.formatMessage({
                        id: 'costs.value',
                        defaultMessage: 'Value',
                      })}
                      active={valueSorted}
                      order={sort?.order ?? 'desc'}
                      onSort={() =>
                        setSort(
                          'value',
                          sort?.order === 'desc' ? 'asc' : 'desc',
                        )
                      }
                      atRest
                    />
                    {/* As wide as its chip, as a number column is: a
                        text column it is not, and taking the rest it
                        left the figures mid-table (E1). */}
                    <TableCell
                      sx={{ width: '1%' }}
                      aria-label={intl.formatMessage({
                        id: 'common.status',
                        defaultMessage: 'Status',
                      })}
                    />
                  </TableRow>
                </TableHead>

                <TableBody>
                  {pools.loading && <PlaceholderRows columns={6} />}
                  {pools.entries?.map((pool, index) => (
                    <TableRow key={poolKey(pool)} {...rowReturn(poolKey(pool))}>
                      <TableCell>
                        {/* The name first, its code grey, as every list
                            of items reads (#296, #631). */}
                        <NameAndCode
                          name={itemName(pool.productName, pool.variantName)}
                          code={pool.sku}
                          type={pool.type}
                          coverFileId={pool.coverFileId}
                          to={`/items/${pool.productId}`}
                          linkRef={index === firstNew ? firstNewRef : undefined}
                        />
                      </TableCell>
                      <TableCell>
                        {pool.lotId && pool.lotCode ? (
                          <LotLink id={pool.lotId} code={pool.lotCode} />
                        ) : (
                          NO_VALUE
                        )}
                        {/* Its latest former code, as Stock by lot has it
                            (ADR-094 amended, R9, 5a). */}
                        <FormerCodeLine code={pool.lotFormerCode} />
                      </TableCell>
                      <TableCell align="right">
                        {displayQuantity(pool.quantity)}
                      </TableCell>
                      <TableCell align="right">
                        {formatUnitCost(pool.unitCost, currency)}
                      </TableCell>
                      <TableCell align="right">
                        {formatMoney(pool.value, currency)}
                      </TableCell>
                      <TableCell>
                        {pool.provisional && (
                          <StatusChip
                            tone="warning"
                            label={intl.formatMessage({
                              id: 'costs.provisional',
                              defaultMessage: 'Provisional',
                            })}
                          />
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </ListTable>
            )}

            {/* How many the list or the find holds, always (#638), and
                Show 50 more; failing, the rows stay, with a line saying
                so and Try again (#544). */}
            {!pools.failed && pools.entries && (
              <LoadMoreButton
                hasMore={pools.hasMore}
                loading={pools.loadingMore}
                failed={!!pools.error}
                pageSize={PAGE_SIZE}
                onLoadMore={showMore}
                sx={{ p: 2 }}
                before={
                  shown > 0 && (
                    <ShowingLine
                      shown={shown}
                      total={totals.data?.count}
                      more={pools.hasMore}
                      of="pool"
                    />
                  )
                }
              />
            )}
          </Paper>
        </>
      )}

      {currency && (
        <SetCostDialog
          key={costing?.id ?? 'closed'}
          open={costing !== null}
          entry={costing}
          baseCurrency={currency}
          onClose={() => setCosting(null)}
          onSaved={load}
        />
      )}
    </Stack>
  );
}
