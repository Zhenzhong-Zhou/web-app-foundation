import {
  Box,
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
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { MemberAccess, OrderSummary } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { ListError } from '../components/list-error';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { Reference } from '../components/reference';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import type { OrderDirection } from '../lib/api-names';
import { withDays } from '../lib/date-range';
import { daysUntil } from '../lib/expiry';
import { displayQuantity, formatDay, NO_VALUE } from '../lib/format';
import { organizationToday } from '../lib/time-zone';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { day, flag, oneOf, useListFilters } from '../lib/use-list-filters';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { type ListSort, useListSort, withSort } from '../lib/use-list-sort';
import { useResource } from '../lib/use-resource';
import { rem } from '../theme/rem';
import { STATUS_TONES } from '../theme/status';
import { orderStatusLabel } from './status';

/**
 * `status` is the document's lifecycle and says nothing about how much has
 * arrived — a confirmed order may be half received, and a received one may be
 * a short shipment somebody closed (ADR-027). The Fulfilled column is the
 * arithmetic; this is the decision.
 */
const FILTERS = [
  {
    value: 'open',
    ...defineMessages({
      label: { id: 'orders.filter.open', defaultMessage: 'Open' },
    }),
  },
  {
    value: 'fulfilled',
    ...defineMessages({
      label: { id: 'orders.filter.fulfilled', defaultMessage: 'Fulfilled' },
    }),
  },
  {
    value: 'cancelled',
    ...defineMessages({
      label: { id: 'orders.filter.cancelled', defaultMessage: 'Cancelled' },
    }),
  },
  {
    value: 'all',
    ...defineMessages({
      label: { id: 'orders.filter.all', defaultMessage: 'All' },
    }),
  },
] as const;

/**
 * The quick filters' values, and the two a link may also give: Home's
 * cards open confirmed orders only (ADR-058), which no button stands for.
 */
type Filter = (typeof FILTERS)[number]['value'] | 'draft' | 'confirmed';
const FILTER_VALUES: readonly Filter[] = [
  ...FILTERS.map((option) => option.value),
  'draft',
  'confirmed',
];

/**
 * The list's filters, in the address (ADR-091): Home's tiles open it
 * narrowed, `?direction=sale&outstanding=1`, and what is pressed here is
 * kept there. `outstanding` is something still to ship or to come (ADR-058,
 * #163); `late` is that and expected before the organization's today,
 * which the server decides; `from` and `to` are the expected days.
 */
const ADDRESS_FILTERS = {
  status: oneOf(FILTER_VALUES, 'open'),
  direction: oneOf<OrderDirection | ''>(['', 'sale', 'purchase'], ''),
  outstanding: flag,
  late: flag,
  from: day,
  to: day,
};

/** What is still to ship or to receive: soonest first, the late leading. */
const SOONEST_EXPECTED: ListSort<'expectedAt'> = {
  key: 'expectedAt',
  order: 'asc',
};

export function OrdersPage() {
  const intl = useIntl();
  const can = useCan();

  const [filters, setFilters] = useListFilters(ADDRESS_FILTERS);
  const { status: filter, direction, outstanding, late } = filters;
  const range = { from: filters.from, to: filters.to };
  const { text, setText, search } = useListSearch();
  // By expected date, and sortable by it (ADR-057); the export takes the
  // same query, so the file is what the list shows. What is still to ship
  // or to receive runs soonest first until a header is chosen (ADR-091).
  const { sort, header } = useListSort(
    ['expectedAt'],
    outstanding || late ? SOONEST_EXPECTED : null,
  );
  const path = withSort(
    withDays(
      withSearch(
        `/orders?${new URLSearchParams({
          status: filter,
          ...(direction ? { direction } : {}),
          ...(outstanding ? { outstanding: 'true' } : {}),
          ...(late ? { late: 'true' } : {}),
        }).toString()}`,
        search,
      ),
      range,
    ),
    sort,
  );
  const expected = intl.formatMessage({
    id: 'orders.expected',
    defaultMessage: 'Expected',
  });

  const canCreate = can('orders.create');
  const {
    entries: items,
    error,
    refused,
    failed,
    loading,
    hasMore,
    loadingMore,
    loadMore,
    reload,
  } = useKeysetList<OrderSummary>(path);
  const showSkeleton = useDelayedFlag(loading);
  // Every row of these is outstanding, as the server counts it, so one
  // expected before the organization's today is late, as Home says
  // (ADR-091). Elsewhere a row's own sums cannot tell: a line closed short
  // still counts what never came.
  const today = outstanding || late ? organizationToday() : null;

  if (refused) {
    return <RevisionRefusalPage failure={refused} onRetry={reload} />;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.orders',
          defaultMessage: 'Orders',
        })}
        actions={
          <>
            <ExportButton path={path.replace('/orders', '/orders/export')} />
            {canCreate ? (
              <Button component={RouterLink} to="/orders/new">
                {intl.formatMessage({
                  id: 'orders.raise',
                  defaultMessage: 'Raise an order',
                })}
              </Button>
            ) : (
              <NoRaise />
            )}
          </>
        }
      />

      {/* The one filter row (ADR-055): which orders, as buttons rather
          than a select, so the choice is visible before it is made. One is
          always pressed; pressing another moves to it. */}
      <FilterRow
        search={{
          label: intl.formatMessage({
            id: 'inventory.search',
            defaultMessage: 'Search',
          }),
          value: text,
          onChange: setText,
        }}
        quick={FILTERS.map((option) => ({
          id: option.value,
          label: intl.formatMessage(option.label),
          pressed: filter === option.value,
          onToggle: () => setFilters({ status: option.value }),
        }))}
      >
        <DateRangeFilter
          label={expected}
          value={range}
          onChange={(next) => setFilters({ from: next.from, to: next.to })}
        />
      </FilterRow>

      {/* What a link narrowed that no button shows, each removable. */}
      {(direction ||
        outstanding ||
        late ||
        filter === 'draft' ||
        filter === 'confirmed') && (
        <Stack direction="row" spacing={1}>
          {direction && (
            <Chip
              label={
                direction === 'sale'
                  ? intl.formatMessage({
                      id: 'orders.filter.sales',
                      defaultMessage: 'Sales only',
                    })
                  : intl.formatMessage({
                      id: 'orders.filter.purchases',
                      defaultMessage: 'Purchases only',
                    })
              }
              onDelete={() => setFilters({ direction: '' })}
            />
          )}
          {(filter === 'draft' || filter === 'confirmed') && (
            <Chip
              label={orderStatusLabel(filter, direction || 'sale')}
              onDelete={() => setFilters({ status: 'open' })}
            />
          )}
          {outstanding && (
            <Chip
              label={
                direction === 'sale'
                  ? intl.formatMessage({
                      id: 'orders.filter.toShip',
                      defaultMessage: 'Still to ship',
                    })
                  : direction === 'purchase'
                    ? intl.formatMessage({
                        id: 'orders.filter.toReceive',
                        defaultMessage: 'Still to receive',
                      })
                    : intl.formatMessage({
                        id: 'orders.filter.outstanding',
                        defaultMessage: 'Still to ship or receive',
                      })
              }
              onDelete={() => setFilters({ outstanding: false })}
            />
          )}
          {late && (
            <Chip
              label={intl.formatMessage({
                id: 'orders.filter.late',
                defaultMessage: 'Late',
              })}
              onDelete={() => setFilters({ late: false })}
            />
          )}
        </Stack>
      )}

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
          ) : items?.length ? (
            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'orders.number',
                        defaultMessage: 'Number',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'orders.partner',
                        defaultMessage: 'Partner',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'orders.direction',
                        defaultMessage: 'Direction',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'orders.reference',
                        defaultMessage: 'Reference',
                      })}
                    </TableCell>
                    <SortHeader label={expected} {...header('expectedAt')} />
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'orders.fulfilled',
                        defaultMessage: 'Fulfilled',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'common.status',
                        defaultMessage: 'Status',
                      })}
                    </TableCell>
                  </TableRow>
                </TableHead>

                <TableBody>
                  {items.map((order) => (
                    <TableRow key={order.id} hover>
                      {/* Ours, which every order has (ADR-071): the link. */}
                      <TableCell>
                        <Link component={RouterLink} to={`/orders/${order.id}`}>
                          <Reference>{order.number}</Reference>
                        </Link>
                      </TableCell>
                      <TableCell>{order.partnerName}</TableCell>

                      {/* Which way the goods go, in a person's words — the first
                      thing anyone scanning this list wants to know. */}
                      <TableCell>
                        {order.direction === 'purchase'
                          ? intl.formatMessage({
                              id: 'orders.direction.buying',
                              defaultMessage: 'Buying',
                            })
                          : intl.formatMessage({
                              id: 'orders.direction.selling',
                              defaultMessage: 'Selling',
                            })}
                        {/* Beside the direction rather than instead of it: a
                        sample is still stock leaving (ADR-042). */}
                        {order.isSample && (
                          <Chip
                            label={intl.formatMessage({
                              id: 'orders.sample',
                              defaultMessage: 'Sample',
                            })}
                            size="small"
                            variant="outlined"
                            sx={{ ml: 1 }}
                          />
                        )}
                      </TableCell>

                      {/* Their number, not ours. Nullable, because an order placed
                      by phone has none. */}
                      <TableCell>{order.reference ?? NO_VALUE}</TableCell>

                      <TableCell>
                        {order.expectedAt
                          ? formatDay(order.expectedAt)
                          : NO_VALUE}
                        <LateChip expected={order.expectedAt} today={today} />
                      </TableCell>

                      {/* Rendered as Postgres computed them, only the decimal
                      separator the language's. Parsing a numeric(18,4) into a
                      JS number to make a percentage is how a quantity loses
                      its last decimal place (ADR-025). */}
                      <TableCell align="right">
                        {intl.formatMessage(
                          {
                            id: 'orders.fulfilledOfOrdered',
                            defaultMessage: '{fulfilled} / {ordered}',
                          },
                          {
                            fulfilled: displayQuantity(order.quantityFulfilled),
                            ordered: displayQuantity(order.quantityOrdered),
                          },
                        )}
                      </TableCell>

                      <TableCell>
                        {/* Its tone from the one table (ADR-055), its words
                          from the catalogue rather than CSS capitalisation. */}
                        <StatusChip
                          tone={STATUS_TONES.order[order.status]}
                          label={orderStatusLabel(
                            order.status,
                            order.direction,
                          )}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>
          ) : (
            // No Raise an order here: the page header already offers it, and
            // a second button for the same act is one too many.
            <EmptyState learnMore={{ guide: 'orders', section: 'raise' }}>
              {search || range.from || range.to
                ? intl.formatMessage({
                    id: 'inventory.noMatch',
                    defaultMessage: 'Nothing matches that search.',
                  })
                : filter === 'open'
                  ? intl.formatMessage({
                      id: 'orders.empty.open',
                      defaultMessage:
                        'Nothing open. Raising an order records what you asked a partner for — receiving against it is what puts the stock on a shelf.',
                    })
                  : intl.formatMessage({
                      id: 'orders.empty.filtered',
                      defaultMessage: 'No orders match that filter.',
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
    </Stack>
  );
}

/**
 * Home's chip on a late row (ADR-091), "2 days late", so the word a tile
 * and its late button said is on the list they open. Nothing on a row that
 * is not late, or where the list cannot tell (`today` null).
 */
function LateChip({
  expected,
  today,
}: {
  expected: string | null;
  today: string | null;
}) {
  const intl = useIntl();
  const days = expected && today ? -daysUntil(expected, today) : 0;
  if (days <= 0) return null;

  return (
    <Box component="span" sx={{ display: 'inline-flex', ml: 1 }}>
      <StatusChip
        tone="critical"
        label={intl.formatMessage(
          {
            id: 'orders.chip.late',
            defaultMessage:
              '{days, plural, one {# day late} other {# days late}}',
          },
          { days },
        )}
      />
    </Box>
  );
}

/**
 * Where Raise an order would be, for a role that cannot raise one: one
 * quiet line saying so, and whom to ask, the people Home's line and Your
 * access name (ADR-091, ADR-079). Nothing until they are read, so the line
 * does not change under the reader.
 */
function NoRaise() {
  const intl = useIntl();
  const { data, error } = useResource<MemberAccess>('/account/membership');
  if (!data && !error) return null;
  const names = data?.whomToAsk.map((person) => person.name) ?? [];

  return (
    <Typography sx={{ color: 'text.secondary', maxWidth: rem(480) }}>
      {names.length > 0
        ? intl.formatMessage(
            {
              id: 'orders.raise.ask',
              defaultMessage:
                'Your role does not include raising orders. To do more, ask {names}.',
            },
            { names: intl.formatList(names, { type: 'disjunction' }) },
          )
        : intl.formatMessage({
            id: 'orders.raise.none',
            defaultMessage: 'Your role does not include raising orders.',
          })}
    </Typography>
  );
}
