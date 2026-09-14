import {
  Alert,
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
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import type {
  Location,
  OrderDetail,
  OrderLine,
  OrderStatus,
  VariantOption,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { leavesOf } from '../locations/tree';
import { CloseOrderDialog } from './close-order-dialog';
import { ReceiveLineDialog } from './receive-line-dialog';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

const STATUS_COLOUR: Record<OrderStatus, 'default' | 'primary' | 'success'> = {
  draft: 'default',
  confirmed: 'primary',
  received: 'success',
  cancelled: 'default',
};

/**
 * Mirrors ALLOWED_FROM in OrdersService, and is not the enforcement.
 *
 * The server refuses an illegal transition with a 409 whatever this says —
 * offering a button that always fails is the thing being avoided, not the
 * rule being implemented. Received and cancelled are terminal: an order that
 * turns out wrong is corrected by an adjustment movement, not by reopening
 * the document (ADR-023).
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['received', 'cancelled'],
  received: [],
  cancelled: [],
};

const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirm',
  received: 'Mark received',
  cancelled: 'Cancel order',
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [receiving, setReceiving] = useState<OrderLine | null>(null);
  const [working, setWorking] = useState(false);
  const [closing, setClosing] = useState(false);

  const canUpdate = !!session?.permissions.includes('orders.update');
  const canReceive = !!session?.permissions.includes('orders.receive');
  const loading = order === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    if (!id) return;
    setOrder(await api<OrderDetail>(`/orders/${id}`));
    setError(null);
  }, [id]);

  useEffect(() => {
    let ignore = false;

    void Promise.all([
      api<OrderDetail>(`/orders/${id}`),
      api<VariantOption[]>('/products/variants'),
      api<Location[]>('/locations'),
    ])
      .then(([detail, variantRows, locationRows]) => {
        if (ignore) return;
        setOrder(detail);
        setVariants(variantRows);
        setLocations(locationRows);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  async function moveTo(status: OrderStatus) {
    setWorking(true);
    try {
      await api(`/orders/${id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      });
      await load();
    } catch (caught: unknown) {
      // At the page, not in a dialog: these come from buttons with no form
      // behind them, and the refusal is about the document rather than a
      // field somebody typed.
      setError(messageFor(caught));
    } finally {
      setWorking(false);
    }
  }

  if (loading) {
    return showSkeleton ? (
      <Stack spacing={2}>
        <Skeleton height={48} />
        <Skeleton height={220} />
      </Stack>
    ) : null;
  }

  if (error && !order) return <Alert severity="error">{error}</Alert>;
  if (!order) return null;

  // Stock sits only at leaves (ADR-024), so a receipt has nowhere else to go.
  const leaves = leavesOf(locations);

  /**
   * Purchase orders only. A sale is shipped, and the server says so — the
   * outbound half is not built, and a Receive button on a sales order would
   * be a promise this app cannot keep.
   */
  const receivable =
    canReceive &&
    order.direction === 'purchase' &&
    order.status === 'confirmed';

  return (
    <Stack spacing={3}>
      <Box>
        <Link component={RouterLink} to="/orders" variant="body2">
          Orders
        </Link>

        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mt: 1 }}>
          <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
            <Link component={RouterLink} to={`/partners/${order.partnerId}`}>
              {order.partnerName}
            </Link>
          </Typography>

          <Chip
            label={order.status}
            color={STATUS_COLOUR[order.status]}
            sx={{ textTransform: 'capitalize' }}
          />
        </Stack>

        <Typography variant="body2" color="text.secondary">
          {order.direction === 'purchase' ? 'Buying' : 'Selling'}
          {order.reference ? ` · ${order.reference}` : ''}
          {order.expectedAt
            ? ` · expected ${formatDate(order.expectedAt)}`
            : ''}
        </Typography>
      </Box>

      {error && <Alert severity="error">{error}</Alert>}

      {order.note && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {order.note}
          </Typography>
        </Paper>
      )}

      {canUpdate && NEXT_STATUSES[order.status].length > 0 && (
        <Stack direction="row" spacing={2}>
          {NEXT_STATUSES[order.status].map((next) => (
            <Button
              key={next}
              variant={next === 'confirmed' ? 'contained' : 'text'}
              disabled={working}
              onClick={() => {
                // Only the close needs asking about. Confirming commits to an
                // order and cancelling is already phrased as a decision.
                if (next === 'received' && !order.fullyReceived) {
                  setClosing(true);
                  return;
                }
                void moveTo(next);
              }}
            >
              {STATUS_LABEL[next]}
            </Button>
          ))}
        </Stack>
      )}

      <Box>
        <Typography variant="h6" component="h2" sx={{ mb: 1 }}>
          Items
        </Typography>

        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Ordered</TableCell>
                <TableCell>Received</TableCell>
                <TableCell>Outstanding</TableCell>
                {receivable && <TableCell align="right">Receive</TableCell>}
              </TableRow>
            </TableHead>

            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id} hover>
                  {/* Snapshotted when the order was raised, so a rename
                      affects the catalogue and nothing historical
                      (ADR-023). */}
                  <TableCell>{line.sku}</TableCell>

                  {/* Both rendered as Postgres stored them. Subtracting one
                      from the other to show what is outstanding would mean
                      parsing a numeric(18,4) into a double (ADR-025) — if
                      that column is wanted, the server computes it. */}
                  <TableCell>{line.quantityOrdered}</TableCell>
                  <TableCell>{line.quantityFulfilled}</TableCell>
                  <TableCell>{line.quantityOutstanding}</TableCell>

                  {receivable && (
                    <TableCell align="right">
                      {!line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setReceiving(line)}
                        >
                          Receive
                        </Button>
                      )}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>

        {order.status === 'draft' && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            Nothing can be received against a draft. Confirming is what says
            this order is real.
          </Typography>
        )}
      </Box>

      {/* Keyed on the line, so the form is seeded at mount and never needs an
          effect to resync. */}
      <ReceiveLineDialog
        key={receiving?.id ?? 'closed'}
        orderId={order.id}
        line={receiving}
        variant={variants.find((row) => row.id === receiving?.variantId)}
        locations={leaves}
        onClose={() => setReceiving(null)}
        onReceived={load}
      />

      <CloseOrderDialog
        open={closing}
        onClose={() => setClosing(false)}
        onConfirm={() => {
          setClosing(false);
          void moveTo('received');
        }}
      />
    </Stack>
  );
}
