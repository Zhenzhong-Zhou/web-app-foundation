import {
  Alert,
  Button,
  Chip,
  Link,
  MenuItem,
  Paper,
  Skeleton,
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
import { useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { LoadMoreButton } from '../components/load-more-button';
import { PageHeader } from '../components/page-header';
import { formatDay } from '../lib/format';
import type { OrderStatus, OrderSummary } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useKeysetList } from '../lib/use-keyset-list';

/**
 * `status` is the document's lifecycle and says nothing about how much has
 * arrived — a confirmed order may be half received, and a received one may be
 * a short shipment somebody closed (ADR-027). The Fulfilled column is the
 * arithmetic; this is the decision.
 */
const STATUS_COLOUR: Record<OrderStatus, 'default' | 'primary' | 'success'> = {
  draft: 'default',
  confirmed: 'primary',
  fulfilled: 'success',
  cancelled: 'default',
};

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'fulfilled', label: 'Fulfilled' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export function OrdersPage() {
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
        title="Orders"
        actions={
          canCreate && (
            <Button component={RouterLink} to="/orders/new">
              Raise an order
            </Button>
          )
        }
      />

      {/* Its own row, as on the audit page: the header holds what the page
          is and what you can do on it, and a filter is neither. It is also
          where the next filter goes — partner and direction are the obvious
          ones — without crowding the title. */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          id="order-filter"
          select
          size="small"
          label="Show"
          value={filter}
          onChange={(event) => setFilter(event.target.value as Filter)}
          sx={{ minWidth: 160 }}
        >
          {FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>
      </Stack>

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
                  <TableCell>Partner</TableCell>
                  <TableCell>Direction</TableCell>
                  <TableCell>Reference</TableCell>
                  <TableCell>Expected</TableCell>
                  <TableCell>Fulfilled</TableCell>
                  <TableCell>Status</TableCell>
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
                      {order.direction === 'purchase' ? 'Buying' : 'Selling'}
                      {/* Beside the direction rather than instead of it: a
                        sample is still stock leaving (ADR-042). */}
                      {order.isSample && (
                        <Chip
                          label="Sample"
                          size="small"
                          variant="outlined"
                          sx={{ ml: 1 }}
                        />
                      )}
                    </TableCell>

                    {/* Their number, not ours. Nullable, because an order placed
                      by phone has none. */}
                    <TableCell>{order.reference ?? '—'}</TableCell>

                    <TableCell>
                      {order.expectedAt ? formatDay(order.expectedAt) : '—'}
                    </TableCell>

                    {/* Rendered as Postgres computed them. Parsing a
                      numeric(18,4) into a JS number to make a percentage is
                      how a quantity loses its last decimal place (ADR-025). */}
                    <TableCell>
                      {order.quantityFulfilled} / {order.quantityOrdered}
                    </TableCell>

                    <TableCell>
                      <Chip
                        label={
                          order.status === 'fulfilled'
                            ? order.direction === 'sale'
                              ? 'Shipped'
                              : 'Received'
                            : order.status
                        }
                        size="small"
                        color={STATUS_COLOUR[order.status]}
                        sx={{ textTransform: 'capitalize' }}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {filter === 'open'
              ? 'Nothing open. Raising an order records what you asked a partner for — receiving against it is what puts the stock on a shelf.'
              : 'No orders match that filter.'}
          </Typography>
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
