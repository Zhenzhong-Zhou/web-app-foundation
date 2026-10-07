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
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { EmptyState } from '../components/empty-state';
import { FilterRow } from '../components/filter-row';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { StatusChip } from '../components/status-chip';
import { displayQuantity, formatDay, NO_VALUE } from '../lib/format';
import type { OrderSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';
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

type Filter = (typeof FILTERS)[number]['value'];

export function OrdersPage() {
  const intl = useIntl();
  const can = useCan();

  const [filter, setFilter] = useState<Filter>('open');

  const canCreate = can('orders.create');
  const {
    entries: items,
    error,
    loading,
    hasMore,
    loadingMore,
    loadMore,
  } = useKeysetList<OrderSummary>(
    `/orders?${new URLSearchParams({ status: filter }).toString()}`,
  );
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
          canCreate && (
            <Button component={RouterLink} to="/orders/new">
              {intl.formatMessage({
                id: 'orders.raise',
                defaultMessage: 'Raise an order',
              })}
            </Button>
          )
        }
      />

      {/* The one filter row (ADR-055): which orders, as buttons rather
          than a select, so the choice is visible before it is made. One is
          always pressed; pressing another moves to it. */}
      <FilterRow
        quick={FILTERS.map((option) => ({
          id: option.value,
          label: intl.formatMessage(option.label),
          pressed: filter === option.value,
          onToggle: () => setFilter(option.value),
        }))}
      />

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
                  <TableCell>
                    {intl.formatMessage({
                      id: 'orders.expected',
                      defaultMessage: 'Expected',
                    })}
                  </TableCell>
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
            {filter === 'open'
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
