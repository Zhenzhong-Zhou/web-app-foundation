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
} from '@mui/material';
import { useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { DateRangeFilter } from '../components/date-range-filter';
import { EmptyState } from '../components/empty-state';
import { ExportButton } from '../components/export-button';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { SortHeader } from '../components/sort-header';
import { StatusChip } from '../components/status-chip';
import { fromAddress } from '../lib/address-filter';
import { type DayRange, withDays } from '../lib/date-range';
import { displayQuantity, formatDay, NO_VALUE } from '../lib/format';
import type { OrderDirection, OrderSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
import { useListSearch, withSearch } from '../lib/use-list-search';
import { useListSort, withSort } from '../lib/use-list-sort';
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

export function OrdersPage() {
  const intl = useIntl();
  const can = useCan();

  // Opened from Home: ?direction=sale&status=confirmed (ADR-058).
  const [params] = useSearchParams();
  const [filter, setFilter] = useState<Filter>(() =>
    fromAddress(params, 'status', FILTER_VALUES, 'open'),
  );
  const [direction, setDirection] = useState<OrderDirection | ''>(() =>
    fromAddress<OrderDirection | ''>(
      params,
      'direction',
      ['', 'sale', 'purchase'],
      '',
    ),
  );
  const { text, setText, search } = useListSearch();
  // By expected date, and sortable by it (ADR-057); the export takes the
  // same query, so the file is what the list shows.
  const [range, setRange] = useState<DayRange>({});
  const { sort, toggle } = useListSort<'expectedAt'>();
  const path = withSort(
    withDays(
      withSearch(
        `/orders?${new URLSearchParams({
          status: filter,
          ...(direction ? { direction } : {}),
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
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<OrderSummary>(path);
  const showSkeleton = useDelayedFlag(loading);

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[]}
        title={intl.formatMessage({
          id: 'layout.nav.orders',
          defaultMessage: 'Orders',
        })}
        actions={
          <Stack direction="row" spacing={1}>
            <ExportButton path={path.replace('/orders', '/orders/export')} />
            {canCreate && (
              <Button component={RouterLink} to="/orders/new">
                {intl.formatMessage({
                  id: 'orders.raise',
                  defaultMessage: 'Raise an order',
                })}
              </Button>
            )}
          </Stack>
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
          onToggle: () => setFilter(option.value),
        }))}
      >
        <DateRangeFilter label={expected} value={range} onChange={setRange} />
      </FilterRow>

      {/* What a link narrowed that no button shows, each removable. */}
      {(direction || filter === 'draft' || filter === 'confirmed') && (
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
              onDelete={() => setDirection('')}
            />
          )}
          {(filter === 'draft' || filter === 'confirmed') && (
            <Chip
              label={orderStatusLabel(filter, direction || 'sale')}
              onDelete={() => setFilter('open')}
            />
          )}
        </Stack>
      )}

      {error && <Alert severity="error">{error}</Alert>}

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
                  <SortHeader
                    label={expected}
                    active={sort?.key === 'expectedAt'}
                    order={sort?.order ?? 'asc'}
                    onSort={() => toggle('expectedAt')}
                  />
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
                    <TableCell>
                      <Link component={RouterLink} to={`/orders/${order.id}`}>
                        {order.partnerName}
                      </Link>
                    </TableCell>

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
                        label={orderStatusLabel(order.status, order.direction)}
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
          <EmptyState>
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

      <LoadMoreButton
        hasMore={hasMore}
        loading={loadingMore}
        onLoadMore={loadMore}
      />
    </Stack>
  );
}
