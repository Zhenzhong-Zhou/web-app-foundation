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
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ApiError, api } from '../lib/api';
import { formatDate } from '../lib/format';
import type { OrderPage, OrderSummary, OrderStatus } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * `status` is the document's lifecycle and says nothing about how much has
 * arrived — a confirmed order may be half received, and a received one may be
 * a short shipment somebody closed (ADR-027). The Received column is the
 * arithmetic; this is the decision.
 */
const STATUS_COLOUR: Record<OrderStatus, 'default' | 'primary' | 'success'> = {
  draft: 'default',
  confirmed: 'primary',
  received: 'success',
  cancelled: 'default',
};

const FILTERS = [
  { value: 'open', label: 'Open' },
  { value: 'received', label: 'Received' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'all', label: 'All' },
] as const;

type Filter = (typeof FILTERS)[number]['value'];

export function OrdersPage() {
  const { session } = useAuth();

  const [items, setItems] = useState<OrderSummary[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('open');
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const canCreate = !!session?.permissions.includes('orders.create');
  const loading = items === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  /**
   * `before` absent loads the first page and replaces; present appends.
   *
   * Appending rather than replacing is the whole point of a keyset cursor —
   * the rows already on screen stay put, so a new order arriving mid-scroll
   * cannot shift the page under someone's cursor the way offset paging does.
   */
  const load = useCallback(async (nextFilter: Filter, before?: string) => {
    const params = new URLSearchParams({ status: nextFilter });
    if (before) params.set('before', before);

    const page = await api<OrderPage>(`/orders?${params.toString()}`);

    setItems((current) =>
      before ? [...(current ?? []), ...page.entries] : page.entries,
    );
    setCursor(page.nextCursor);
    setError(null);
  }, []);

  useEffect(() => {
    let ignore = false;

    const params = new URLSearchParams({ status: filter });

    void api<OrderPage>(`/orders?${params.toString()}`)
      .then((page) => {
        if (ignore) return;
        setItems(page.entries);
        setCursor(page.nextCursor);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [filter]);

  async function loadMore() {
    if (!cursor) return;

    setLoadingMore(true);
    try {
      await load(filter, cursor);
    } catch (caught: unknown) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  function changeFilter(next: Filter) {
    // Cleared rather than kept: a cursor points into the previous filter's
    // ordering, and carrying it over would page through rows the new filter
    // never selected.
    setItems(null);
    setCursor(null);
    setError(null);
    setFilter(next);
  }

  return (
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Orders
        </Typography>

        <TextField
          select
          size="small"
          label="Show"
          value={filter}
          onChange={(event) => changeFilter(event.target.value as Filter)}
          sx={{ minWidth: 140 }}
        >
          {FILTERS.map((option) => (
            <MenuItem key={option.value} value={option.value}>
              {option.label}
            </MenuItem>
          ))}
        </TextField>

        {canCreate && (
          <Button component={RouterLink} to="/orders/new">
            Raise an order
          </Button>
        )}
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
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Partner</TableCell>
                <TableCell>Direction</TableCell>
                <TableCell>Reference</TableCell>
                <TableCell>Expected</TableCell>
                <TableCell>Received</TableCell>
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
                  </TableCell>

                  {/* Their number, not ours. Nullable, because an order placed
                      by phone has none. */}
                  <TableCell>{order.reference ?? '—'}</TableCell>

                  <TableCell>
                    {order.expectedAt ? formatDate(order.expectedAt) : '—'}
                  </TableCell>

                  {/* Rendered as Postgres computed them. Parsing a
                      numeric(18,4) into a JS number to make a percentage is
                      how a quantity loses its last decimal place (ADR-025). */}
                  <TableCell>
                    {order.quantityFulfilled} / {order.quantityOrdered}
                  </TableCell>

                  <TableCell>
                    <Chip
                      label={order.status}
                      size="small"
                      color={STATUS_COLOUR[order.status]}
                      sx={{ textTransform: 'capitalize' }}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            {filter === 'open'
              ? 'Nothing open. Raising an order records what you asked a partner for — receiving against it is what puts the stock on a shelf.'
              : 'No orders match that filter.'}
          </Typography>
        )}
      </Paper>

      {cursor && (
        <Button
          variant="text"
          disabled={loadingMore}
          onClick={() => void loadMore()}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Stack>
  );
}
