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
import { type ReactNode, useEffect, useRef, useState } from 'react';
import {
  defineMessages,
  FormattedMessage,
  type IntlShape,
  useIntl,
} from 'react-intl';
import { Link as RouterLink, useLocation } from 'react-router-dom';

import type { NeedsCostEntry, StockValuation } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { ExportButton } from '../components/export-button';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { Reference } from '../components/reference';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { LearnMore } from '../help/learn-more';
import { MAIN_CONTENT_ID } from '../layout/skip-link';
import {
  displayQuantity,
  formatDate,
  formatMoney,
  formatUnitCost,
  NO_VALUE,
} from '../lib/format';
import { OFFER_BACK } from '../lib/offer-back';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useResource } from '../lib/use-resource';
import { SetCostDialog } from './set-cost-dialog';

/**
 * The address's `#costs`, Help's id for its section on giving stock its
 * cost: the page opens at its list of what waits, as Home's Waiting for a
 * cost tile does (ADR-091; #505's 8).
 */
const WAITING_HASH = '#costs';

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
  const read = useResource<{ valuation: StockValuation }>('/costs/valuation');
  const valuation = read.data?.valuation ?? null;
  // A page at a time, with Load more, by the hook every list shares (#33).
  const waiting = useKeysetList<NeedsCostEntry>('/costs/needs-cost');
  const refused = read.refused ?? waiting.refused;
  const errorWords = read.error ?? waiting.error;
  const [costing, setCosting] = useState<NeedsCostEntry | null>(null);
  const location = useLocation();
  const waitingSection = useRef<HTMLDivElement>(null);
  const waitingHeading = useRef<HTMLHeadingElement>(null);
  const openedAt = useRef<string | null>(null);

  const loading = (read.loading || waiting.loading) && errorWords === null;
  const showSkeleton = useDelayedFlag(loading);
  const canUpdate = can('costs.update');

  // Opened at what waits: once it has loaded, its list where the page's
  // content begins, under the bar, and its heading given focus, as a link
  // to a part of a page gives it; once per arrival, never again on a read
  // after a cost is set.
  useEffect(() => {
    if (loading || location.hash !== WAITING_HASH) return;
    if (openedAt.current === location.key) return;
    openedAt.current = location.key;
    const section = waitingSection.current;
    const main = document.getElementById(MAIN_CONTENT_ID);
    if (!section || !main) return;
    window.scrollTo({
      top:
        section.getBoundingClientRect().top -
        main.getBoundingClientRect().top -
        parseFloat(getComputedStyle(main).paddingTop),
    });
    waitingHeading.current?.focus({ preventScroll: true });
  }, [loading, location.hash, location.key]);

  /** Both read again, after a cost is set or a refusal's Try again. */
  async function load() {
    waiting.reload();
    await read.reload();
  }

  const currency = valuation?.currency ?? null;

  if (refused) {
    return (
      <RevisionRefusalPage failure={refused} onRetry={() => void load()} />
    );
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

      {errorWords && <Alert severity="error">{errorWords}</Alert>}

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
                    {waiting.entries?.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <Reference>{entry.sku}</Reference>
                        </TableCell>
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
                        <TableCell>
                          <Reference>{pool.sku}</Reference>
                        </TableCell>
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
