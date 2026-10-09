import {
  Alert,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { type ReactNode, useCallback, useEffect, useState } from 'react';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { ExportButton } from '../components/export-button';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { api, messageFor } from '../lib/api';
import {
  displayQuantity,
  formatDate,
  formatMoney,
  formatUnitCost,
  NO_VALUE,
} from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { NeedsCostEntry, StockValuation } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { SetCostDialog } from './set-cost-dialog';

interface NeedsCostPage {
  entries: NeedsCostEntry[];
  nextCursor: string | null;
}

/**
 * Only an acquisition takes a cost; the server refuses the rest (ADR-048).
 * A batch's output waits for its run to close instead.
 */
function takesACost(entry: NeedsCostEntry): boolean {
  return (
    entry.kind === 'opening' ||
    entry.reason === 'receipt' ||
    entry.reason === 'adjustment'
  );
}

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
});

function whyWaiting(entry: NeedsCostEntry, intl: IntlShape): string {
  if (entry.kind === 'opening') return intl.formatMessage(WHY.opening);
  if (entry.reason === 'production') return intl.formatMessage(WHY.production);
  if (entry.reason === 'adjustment') return intl.formatMessage(WHY.adjustment);
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
 */
export function StockValuePage() {
  const intl = useIntl();
  const can = useCan();
  const [valuation, setValuation] = useState<StockValuation | null>(null);
  const [waiting, setWaiting] = useState<NeedsCostPage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [costing, setCosting] = useState<NeedsCostEntry | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loading = (valuation === null || waiting === null) && error === null;
  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('costs.update');

  const fetchAll = useCallback(
    () =>
      Promise.all([
        api<{ valuation: StockValuation }>('/costs/valuation'),
        api<NeedsCostPage>('/costs/needs-cost'),
      ]),
    [],
  );

  const load = useCallback(async () => {
    try {
      const [value, page] = await fetchAll();
      setValuation(value.valuation);
      setWaiting(page);
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
  }, [fetchAll]);

  useEffect(() => {
    let ignore = false;

    void fetchAll()
      .then(([value, page]) => {
        if (ignore) return;
        setValuation(value.valuation);
        setWaiting(page);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [fetchAll]);

  async function loadMore() {
    if (!waiting?.nextCursor) return;
    setLoadingMore(true);

    try {
      const next = await api<NeedsCostPage>(
        `/costs/needs-cost?before=${waiting.nextCursor}`,
      );
      setWaiting({
        entries: [...waiting.entries, ...next.entries],
        nextCursor: next.nextCursor,
      });
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  const currency = valuation?.currency ?? null;

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.menu.stockValue',
          defaultMessage: 'Stock value',
        })}
        subtitle={intl.formatMessage({
          id: 'costs.intro',
          defaultMessage:
            'Each lot carries what it cost; stock without lots carries a running average. Values are material cost only — what was bought and what went into a batch — in the base currency.',
        })}
        actions={<ExportButton path="/costs/valuation/export" />}
      />

      {error && <Alert severity="error">{error}</Alert>}

      {valuation && !currency && (
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
                  id: 'inventory.promised.onHand',
                  defaultMessage: 'On hand',
                })}
              </Typography>
              <Typography variant="h6" component="p">
                {formatMoney(valuation?.total ?? null, currency)}
              </Typography>
              {valuation?.provisional && (
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

          <Paper variant="outlined">
            <Typography variant="subtitle1" component="h2" sx={{ p: 2 }}>
              {intl.formatMessage({
                id: 'costs.waiting',
                defaultMessage: 'Waiting for a cost',
              })}
            </Typography>

            {waiting?.entries.length === 0 ? (
              <Alert severity="success">
                {intl.formatMessage({
                  id: 'costs.allCosted',
                  defaultMessage: 'Everything on hand has a cost.',
                })}
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
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
                      <TableCell align="right">
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
                      <TableCell
                        align="right"
                        aria-label={intl.formatMessage({
                          id: 'orders.lines.actions',
                          defaultMessage: 'Actions',
                        })}
                      />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {waiting?.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.sku}</TableCell>
                        <TableCell>{entry.lotCode ?? NO_VALUE}</TableCell>
                        <TableCell align="right">
                          {displayQuantity(entry.quantity)}
                        </TableCell>
                        <TableCell>{whyWaiting(entry, intl)}</TableCell>
                        <TableCell>{formatDate(entry.createdAt)}</TableCell>
                        <TableCell align="right">
                          {entry.reason === 'production' &&
                          entry.referenceId ? (
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
                            canUpdate &&
                            currency &&
                            takesACost(entry) && (
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
                </Table>
              </TableContainer>
            )}

            <LoadMoreButton
              hasMore={Boolean(waiting?.nextCursor)}
              loading={loadingMore}
              onLoadMore={loadMore}
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

            {valuation?.pools.length === 0 ? (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'costs.nothingOnHand',
                  defaultMessage: 'Nothing on hand.',
                })}
              </Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>
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
                      <TableCell align="right">
                        {intl.formatMessage({
                          id: 'inventory.quantity',
                          defaultMessage: 'Quantity',
                        })}
                      </TableCell>
                      <TableCell align="right">
                        {intl.formatMessage({
                          id: 'costs.unitCost',
                          defaultMessage: 'Unit cost',
                        })}
                      </TableCell>
                      <TableCell align="right">
                        {intl.formatMessage({
                          id: 'costs.value',
                          defaultMessage: 'Value',
                        })}
                      </TableCell>
                      <TableCell
                        aria-label={intl.formatMessage({
                          id: 'common.status',
                          defaultMessage: 'Status',
                        })}
                      />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {valuation?.pools.map((pool) => (
                      <TableRow key={`${pool.variantId}:${pool.lotId ?? ''}`}>
                        <TableCell>{pool.sku}</TableCell>
                        <TableCell>
                          {pool.lotId ? (
                            <Link
                              component={RouterLink}
                              to={`/lots/${pool.lotId}`}
                            >
                              {pool.lotCode}
                            </Link>
                          ) : (
                            NO_VALUE
                          )}
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
                </Table>
              </TableContainer>
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
