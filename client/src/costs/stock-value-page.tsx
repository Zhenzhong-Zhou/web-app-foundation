import {
  Alert,
  Button,
  Chip,
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
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { LoadMoreButton } from '../components/load-more-button';
import { api, messageFor } from '../lib/api';
import { formatDate, formatMoney, formatUnitCost } from '../lib/format';
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
function whyWaiting(entry: NeedsCostEntry): string {
  if (entry.kind === 'opening') return 'On hand when valuation began';
  if (entry.reason === 'production') return 'Made by a run that is still open';
  if (entry.reason === 'adjustment')
    return 'Counted in, with nothing to value it by';
  if (entry.unitPrice && entry.currency) {
    return `Priced in ${entry.currency}, with no rate on file`;
  }
  return 'Received with no price';
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
      <Typography variant="h5" component="h1">
        Stock value
      </Typography>

      <Typography variant="body2" color="text.secondary">
        Each lot carries what it cost; stock without lots carries a running
        average. Values are material cost only — what was bought and what went
        into a batch — in the base currency.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      {valuation && !currency && (
        <Alert severity="info">
          No base currency yet, so nothing can be valued. Set one on the{' '}
          <Link component={RouterLink} to="/settings/organization">
            Organization
          </Link>{' '}
          page.
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
                On hand
              </Typography>
              <Typography variant="h6" component="p">
                {formatMoney(valuation?.total ?? null, currency)}
              </Typography>
              {valuation?.provisional && (
                <Chip size="small" label="Provisional" color="warning" />
              )}
            </Stack>
          </Paper>

          <Paper variant="outlined">
            <Typography variant="subtitle1" component="h2" sx={{ p: 2 }}>
              Waiting for a cost
            </Typography>

            {waiting?.entries.length === 0 ? (
              <Alert severity="success">Everything on hand has a cost.</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell>Lot</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell>Why</TableCell>
                      <TableCell>Since</TableCell>
                      <TableCell align="right" aria-label="Actions" />
                    </TableRow>
                  </TableHead>

                  <TableBody>
                    {waiting?.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>{entry.sku}</TableCell>
                        <TableCell>{entry.lotCode ?? '—'}</TableCell>
                        <TableCell align="right">{entry.quantity}</TableCell>
                        <TableCell>{whyWaiting(entry)}</TableCell>
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
                              Open run
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
                                Set cost
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
              By item and lot
            </Typography>

            {valuation?.pools.length === 0 ? (
              <Alert severity="info">Nothing on hand.</Alert>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>Item</TableCell>
                      <TableCell>Lot</TableCell>
                      <TableCell align="right">Quantity</TableCell>
                      <TableCell align="right">Unit cost</TableCell>
                      <TableCell align="right">Value</TableCell>
                      <TableCell aria-label="Status" />
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
                            '—'
                          )}
                        </TableCell>
                        <TableCell align="right">{pool.quantity}</TableCell>
                        <TableCell align="right">
                          {formatUnitCost(pool.unitCost, currency)}
                        </TableCell>
                        <TableCell align="right">
                          {formatMoney(pool.value, currency)}
                        </TableCell>
                        <TableCell>
                          {pool.provisional && (
                            <Chip
                              size="small"
                              label="Provisional"
                              color="warning"
                              variant="outlined"
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
