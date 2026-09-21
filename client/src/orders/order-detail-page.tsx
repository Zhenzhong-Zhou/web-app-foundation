import {
  Alert,
  Box,
  Button,
  Chip,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tooltip,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDate, formatMoney } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  Location,
  OrderDetail,
  OrderLine,
  OrderStatus,
  VariantOption,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { leavesOf } from '../locations/tree';
import { AddOrderLineDialog } from './add-order-line-dialog';
import { CloseLineDialog } from './close-line-dialog';
import { CloseOrderDialog } from './close-order-dialog';
import { DuplicateOrderDialog } from './duplicate-order-dialog';
import { EditOrderDialog } from './edit-order-dialog';
import { EditOrderLineDialog } from './edit-order-line-dialog';
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

/** Button labels. What clicking does, not what the order is. */
const TRANSITION_LABEL: Partial<Record<OrderStatus, string>> = {
  confirmed: 'Confirm',
  received: 'Mark received',
  cancelled: 'Cancel order',
};

/** Chip labels. What the order is, rather than relying on CSS capitalisation. */
const STATUS_LABEL: Record<OrderStatus, string> = {
  draft: 'Draft',
  confirmed: 'Confirmed',
  received: 'Received',
  cancelled: 'Cancelled',
};

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [variants, setVariants] = useState<VariantOption[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [receiving, setReceiving] = useState<OrderLine | null>(null);
  const [working, setWorking] = useState(false);
  const [closing, setClosing] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [addingLine, setAddingLine] = useState(false);
  const [editingLine, setEditingLine] = useState<OrderLine | null>(null);
  const [closingLine, setClosingLine] = useState<OrderLine | null>(null);

  const canUpdate = !!session?.permissions.includes('orders.update');
  const canReceive = !!session?.permissions.includes('orders.receive');
  const canCreate = !!session?.permissions.includes('orders.create');
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

  /**
   * A line action with no form behind it — remove and reopen. Both are a
   * single request and a reload, so a dialog would only add a click.
   */
  async function lineAction(path: string, method: string) {
    setWorking(true);
    setError(null);

    try {
      await api(path, { method });
      await load();
    } catch (caught) {
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

  /** Lines are editable on a draft, and amendable while confirmed (ADR-033). */
  const isDraft = order.status === 'draft';
  const amendable = canUpdate && (isDraft || order.status === 'confirmed');

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[{ label: 'Orders', to: '/orders' }]}
        title={order.partnerName}
        titleTo={`/partners/${order.partnerId}`}
        status={{
          label: STATUS_LABEL[order.status],
          color: STATUS_COLOUR[order.status],
        }}
        actions={
          <Stack direction="row" spacing={1}>
            <HistoryButton resourceId={order.id} />
            {canUpdate && (
              <Button
                variant="text"
                disabled={working}
                onClick={openDialog(() => setEditing(true))}
              >
                Edit
              </Button>
            )}
            {canCreate && (
              <Button
                variant={
                  NEXT_STATUSES[order.status].length === 0 ? 'outlined' : 'text'
                }
                disabled={working}
                onClick={openDialog(() => setDuplicating(true))}
              >
                Duplicate
              </Button>
            )}
          </Stack>
        }
        subtitle={
          <>
            {order.direction === 'purchase' ? 'Buying' : 'Selling'}
            {order.reference ? ` · ${order.reference}` : ''}
            {order.expectedAt
              ? ` · expected ${formatDate(order.expectedAt)}`
              : ''}
            {order.duplicatedFromId && (
              <>
                {' · '}
                <Link
                  component={RouterLink}
                  to={`/orders/${order.duplicatedFromId}`}
                  color="inherit"
                  underline="hover"
                >
                  duplicated from a previous order
                </Link>
              </>
            )}
          </>
        }
      />

      {error && <Alert severity="error">{error}</Alert>}

      {order.note && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {order.note}
          </Typography>
        </Paper>
      )}

      <Box>
        <Stack direction="row" spacing={2} sx={{ alignItems: 'center', mb: 1 }}>
          <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
            Items
          </Typography>

          {/* Draft only: adding to an order the supplier has already been sent
              is a new agreement, not a correction (ADR-033). */}
          {canUpdate && isDraft && (
            <Button
              variant="text"
              disabled={working}
              onClick={() => setAddingLine(true)}
            >
              Add item
            </Button>
          )}
        </Stack>

        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>SKU</TableCell>
                <TableCell>Ordered</TableCell>
                <TableCell>Received</TableCell>
                <TableCell>Outstanding</TableCell>
                <TableCell align="right">Unit price</TableCell>
                <TableCell align="right">Total</TableCell>
                <TableCell align="right" />
              </TableRow>
            </TableHead>

            <TableBody>
              {order.lines.map((line) => (
                <TableRow key={line.id} hover>
                  <TableCell>{line.sku}</TableCell>
                  <TableCell>{line.quantityOrdered}</TableCell>
                  <TableCell>{line.quantityFulfilled}</TableCell>

                  <TableCell>
                    {line.isClosedShort ? (
                      /* The reason in place of the number: outstanding is
                         zero, and why it is zero is the useful part. */
                      <Tooltip title={line.closedReason ?? ''}>
                        <Chip label="Closed short" size="small" />
                      </Tooltip>
                    ) : (
                      line.quantityOutstanding
                    )}
                  </TableCell>

                  <TableCell align="right">
                    {formatMoney(line.unitPrice, line.currency)}
                  </TableCell>
                  <TableCell align="right">
                    {formatMoney(line.lineTotal, line.currency)}
                  </TableCell>

                  <TableCell align="right">
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ justifyContent: 'flex-end' }}
                    >
                      {receivable && !line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => setReceiving(line)}
                        >
                          Receive
                        </Button>
                      )}

                      {amendable && !line.isClosedShort && !line.isComplete && (
                        <Button
                          variant="text"
                          size="small"
                          disabled={working}
                          onClick={() => setEditingLine(line)}
                        >
                          Edit
                        </Button>
                      )}

                      {/* Confirmed only, and only while something is still
                          outstanding — a draft has promised nothing, so
                          removing the line is the right act there. */}
                      {canUpdate &&
                        order.status === 'confirmed' &&
                        !line.isComplete && (
                          <Button
                            variant="text"
                            size="small"
                            disabled={working}
                            onClick={() => setClosingLine(line)}
                          >
                            Close short
                          </Button>
                        )}

                      {canUpdate && line.isClosedShort && (
                        <Button
                          variant="text"
                          size="small"
                          disabled={working}
                          onClick={() =>
                            void lineAction(
                              `/orders/${order.id}/lines/${line.id}/reopen`,
                              'POST',
                            )
                          }
                        >
                          Reopen
                        </Button>
                      )}

                      {/* Draft only, and never the last one — an order with no
                          lines orders nothing (ADR-033). The server refuses
                          both and those 409s render, but a control that always
                          fails is worth not offering. */}
                      {canUpdate && isDraft && order.lines.length > 1 && (
                        <IconButton
                          size="small"
                          aria-label={`Remove ${line.sku}`}
                          disabled={working}
                          onClick={() =>
                            void lineAction(
                              `/orders/${order.id}/lines/${line.id}`,
                              'DELETE',
                            )
                          }
                        >
                          ×
                        </IconButton>
                      )}
                    </Stack>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>

          <Stack sx={{ alignItems: 'flex-end', mt: 1 }} spacing={0.5}>
            {order.totals.map((total) => (
              <Typography key={total.currency} variant="body2">
                {formatMoney(total.amount, total.currency)}
              </Typography>
            ))}

            {/* Said rather than shown as a smaller number: a subtotal that
              silently excludes a line is what somebody reconciles against
              (ADR-035). */}
            {!order.totalsComplete && (
              <Typography variant="caption" color="text.secondary">
                {order.totals.length
                  ? 'Some lines have no price — this is not the full total'
                  : 'No prices recorded on this order'}
              </Typography>
            )}
          </Stack>
        </Paper>

        {order.status === 'draft' && (
          <Typography variant="caption" color="text.secondary" sx={{ mt: 1 }}>
            Nothing can be received against a draft. Confirming is what says
            this order is real.
          </Typography>
        )}
      </Box>

      {canUpdate && NEXT_STATUSES[order.status].length > 0 && (
        <Stack direction="row" spacing={2} sx={{ justifyContent: 'flex-end' }}>
          {/* Cancel first, Confirm last: the rightmost position is where
              "proceed" lives, and the destructive one should not be where a
              thumb lands by default. */}
          {NEXT_STATUSES[order.status]
            .filter((next) => next === 'cancelled')
            .map((next) => (
              <Button
                key={next}
                variant="text"
                color="error"
                disabled={working}
                onClick={() => void moveTo(next)}
              >
                {TRANSITION_LABEL[next]}
              </Button>
            ))}

          {NEXT_STATUSES[order.status]
            .filter((next) => next !== 'cancelled')
            .map((next) => (
              <Button
                key={next}
                variant="contained"
                disabled={working}
                onClick={() => {
                  if (next === 'received' && !order.fullyReceived) {
                    setClosing(true);
                    return;
                  }
                  void moveTo(next);
                }}
              >
                {TRANSITION_LABEL[next]}
              </Button>
            ))}
        </Stack>
      )}

      {/* Keyed on the line, so the form is seeded at mount and never needs an
          effect to resync. */}
      <EditOrderDialog
        key={`${order.id}-${order.reference ?? ''}-${order.expectedAt ?? ''}`}
        open={editing}
        order={order}
        onClose={() => setEditing(false)}
        onSaved={load}
      />

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

      <DuplicateOrderDialog
        open={duplicating}
        order={order}
        onClose={() => setDuplicating(false)}
        onDuplicated={(newOrderId) => navigate(`/orders/${newOrderId}`)}
      />

      <AddOrderLineDialog
        open={addingLine}
        order={order}
        variants={variants}
        onClose={() => setAddingLine(false)}
        onAdded={load}
      />

      <EditOrderLineDialog
        key={editingLine?.id ?? 'no-line'}
        open={editingLine !== null}
        orderId={order.id}
        orderStatus={order.status}
        line={editingLine}
        defaultCurrency={
          order.lines.find((row) => row.currency)?.currency ?? ''
        }
        onClose={() => setEditingLine(null)}
        onSaved={load}
      />

      <CloseLineDialog
        open={closingLine !== null}
        orderId={order.id}
        line={closingLine}
        onClose={() => setClosingLine(null)}
        onClosed={load}
      />
    </Stack>
  );
}
