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
  TableContainer,
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
import { formatDay, formatMoney } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  LineHold,
  Location,
  OrderDetail,
  OrderDirection,
  OrderLine,
  OrderStatus,
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
import { ReturnOrderDialog } from './return-order-dialog';
import { ReturnsList } from './returns-list';
import { ShipOrderDialog } from './ship-order-dialog';
import { ShipmentsList } from './shipments-list';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

const STATUS_COLOUR: Record<OrderStatus, 'default' | 'primary' | 'success'> = {
  draft: 'default',
  confirmed: 'primary',
  fulfilled: 'success',
  cancelled: 'default',
};

/**
 * Mirrors ALLOWED_FROM in OrdersService, and is not the enforcement.
 *
 * The server refuses an illegal transition with a 409 whatever this says —
 * offering a button that always fails is the thing being avoided, not the
 * rule being implemented. Fulfilled and cancelled are terminal: an order
 * that turns out wrong is corrected by an adjustment movement, not by
 * reopening the document (ADR-023).
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/**
 * The word for "done" depends on which way the goods went. The server stores
 * one status, `fulfilled`, so one rule governs both directions (ADR-041);
 * only what a person reads differs.
 */
const DONE: Record<OrderDirection, string> = {
  purchase: 'Received',
  sale: 'Shipped',
};

/** Button labels. What clicking does, not what the order is. */
function transitionLabel(next: OrderStatus, direction: OrderDirection): string {
  if (next === 'fulfilled') return `Mark ${DONE[direction].toLowerCase()}`;
  if (next === 'confirmed') return 'Confirm';
  return 'Cancel order';
}

/** Chip labels. What the order is, rather than relying on CSS capitalisation. */
function statusLabel(status: OrderStatus, direction: OrderDirection): string {
  if (status === 'fulfilled') return DONE[direction];
  if (status === 'draft') return 'Draft';
  if (status === 'confirmed') return 'Confirmed';
  return 'Cancelled';
}

export function OrderDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { session } = useAuth();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetail | null>(null);
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
  const [shipping, setShipping] = useState(false);

  const [returning, setReturning] = useState(false);

  /** Bumped after a shipment so the list below refetches alongside the order. */
  const [shipments, setShipments] = useState(0);

  /** The same, for returns. */
  const [returns, setReturns] = useState(0);

  /**
   * What each line holds and lacks, for a confirmed sale (ADR-045). Keyed by
   * line. Refetched whenever the order reloads, since shipping, closing short
   * or a change to another order all move it.
   */
  const [holds, setHolds] = useState<Record<string, LineHold>>({});

  const canUpdate = !!session?.permissions.includes('orders.update');
  const canReceive = !!session?.permissions.includes('orders.receive');
  const canShip = !!session?.permissions.includes('orders.ship');
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
      api<Location[]>('/locations'),
    ])
      .then(([detail, locationRows]) => {
        if (ignore) return;
        setOrder(detail);
        setLocations(locationRows);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  useEffect(() => {
    if (!order || order.direction !== 'sale' || order.status !== 'confirmed') {
      return;
    }

    let ignore = false;

    void api<LineHold[]>(`/orders/${order.id}/holds`)
      .then((rows) => {
        if (!ignore) {
          setHolds(Object.fromEntries(rows.map((row) => [row.lineId, row])));
        }
      })
      // Silent: without holds the page reads as it did before them.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [order]);

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
   * Inbound is per line — a supplier's delivery is checked in line by line.
   * Outbound is a document: one Ship for the whole order, because what
   * leaves together is one box, one packing slip, one tracking number
   * (ADR-041).
   */
  const receivable =
    canReceive &&
    order.direction === 'purchase' &&
    order.status === 'confirmed';

  const shippable =
    canShip &&
    order.direction === 'sale' &&
    order.status === 'confirmed' &&
    order.lines.some((line) => !line.isComplete);

  /**
   * Returns come back to the dock, so they sit under orders.receive, and are
   * possible once anything has shipped — most often after the order is done
   * (ADR-043). A numeric(18, 4) of nothing always reads '0.0000', so this is
   * a string check rather than parsing a quantity (ADR-025).
   */
  const returnable =
    canReceive &&
    order.direction === 'sale' &&
    (order.status === 'confirmed' || order.status === 'fulfilled') &&
    order.lines.some((line) => line.quantityFulfilled !== '0.0000');

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
          label: statusLabel(order.status, order.direction),
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
            {order.isSample ? ' · sample' : ''}
            {order.reference ? ` · ${order.reference}` : ''}
            {order.expectedAt
              ? ` · expected ${formatDay(order.expectedAt)}`
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
              onClick={openDialog(() => setAddingLine(true))}
            >
              Add item
            </Button>
          )}

          {returnable && (
            <Button
              variant="text"
              disabled={working}
              onClick={openDialog(() => setReturning(true))}
            >
              Take a return
            </Button>
          )}

          {shippable && (
            <Button
              disabled={working}
              onClick={openDialog(() => setShipping(true))}
            >
              Ship
            </Button>
          )}
        </Stack>

        <Paper variant="outlined">
          {/* The table scrolls inside its own frame; the page never does.
              Seven columns do not fit a narrow window, and letting them push
              past the Paper is what put "Close short" over the border.
              nowrap on the numbers and the actions, so a squeeze becomes a
              scroll rather than "Close" above "short". */}
          <TableContainer>
            <Table
              size="small"
              sx={{
                '& th, & td': { whiteSpace: 'nowrap' },
              }}
            >
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  {/* Right-aligned like the money: quantities are compared
                    down a column, and digits only line up on the right. */}
                  <TableCell align="right">Ordered</TableCell>
                  <TableCell align="right">{DONE[order.direction]}</TableCell>
                  {/* Beside shipped, never subtracted from it: that it
                      shipped is the history a recall reads (ADR-043). */}
                  {order.direction === 'sale' && (
                    <TableCell align="right">Returned</TableCell>
                  )}
                  <TableCell align="right">Outstanding</TableCell>
                  <TableCell align="right">Unit price</TableCell>
                  <TableCell align="right">Total</TableCell>
                  {/* No visible title — the buttons explain themselves —
                      but a screen reader announces the column by name. */}
                  <TableCell align="right" aria-label="Actions" />
                </TableRow>
              </TableHead>

              <TableBody>
                {order.lines.map((line) => (
                  <TableRow key={line.id} hover>
                    <TableCell>{line.sku}</TableCell>
                    <TableCell align="right">{line.quantityOrdered}</TableCell>
                    <TableCell align="right">
                      {line.quantityFulfilled}
                    </TableCell>
                    {order.direction === 'sale' && (
                      <TableCell align="right">
                        {line.quantityReturned}
                      </TableCell>
                    )}

                    <TableCell align="right">
                      {line.isClosedShort ? (
                        /* The reason in place of the number: outstanding is
                         zero, and why it is zero is the useful part. */
                        <Tooltip title={line.closedReason ?? ''}>
                          <Chip label="Closed short" size="small" />
                        </Tooltip>
                      ) : (
                        <>
                          {line.quantityOutstanding}
                          {/* The backorder: needed, and not held because
                              earlier-confirmed orders came first (ADR-045).
                              '0.0000' is nothing, compared as text. */}
                          {order.status === 'confirmed' &&
                            holds[line.id] &&
                            holds[line.id].short !== '0.0000' && (
                              <Tooltip
                                title={`${holds[line.id].held} held for this order; the rest waits for stock`}
                              >
                                <Chip
                                  label={`${holds[line.id].short} short`}
                                  size="small"
                                  color="warning"
                                  variant="outlined"
                                  sx={{ ml: 1 }}
                                />
                              </Tooltip>
                            )}
                        </>
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
                            onClick={openDialog(() => setReceiving(line))}
                          >
                            Receive
                          </Button>
                        )}

                        {amendable &&
                          !line.isClosedShort &&
                          !line.isComplete && (
                            <Button
                              variant="text"
                              size="small"
                              disabled={working}
                              onClick={openDialog(() => setEditingLine(line))}
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
                              onClick={openDialog(() => setClosingLine(line))}
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
          </TableContainer>

          {/* Padded to the cells' own inset, so the grand total lines up
              under the Total column rather than touching the frame. */}
          <Stack sx={{ alignItems: 'flex-end', px: 2, py: 1.5 }} spacing={0.5}>
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
            Nothing can be {DONE[order.direction].toLowerCase()} against a
            draft. Confirming is what says this order is real.
          </Typography>
        )}
      </Box>

      {order.direction === 'sale' && (
        <ShipmentsList orderId={order.id} refreshKey={shipments} />
      )}

      {order.direction === 'sale' && (
        <ReturnsList orderId={order.id} refreshKey={returns} />
      )}

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
                {transitionLabel(next, order.direction)}
              </Button>
            ))}

          {NEXT_STATUSES[order.status]
            .filter((next) => next !== 'cancelled')
            .map((next) => (
              <Button
                key={next}
                variant="contained"
                disabled={working}
                onClick={(event) => {
                  // Only this branch opens a dialog, so only it needs the
                  // blur openDialog does — the direct transition keeps focus
                  // on the button, which is right when nothing covers it.
                  if (next === 'fulfilled' && !order.fullyFulfilled) {
                    openDialog(() => setClosing(true))(event);
                    return;
                  }
                  void moveTo(next);
                }}
              >
                {transitionLabel(next, order.direction)}
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
        locations={leaves}
        onClose={() => setReceiving(null)}
        onReceived={load}
      />

      <CloseOrderDialog
        open={closing}
        direction={order.direction}
        onClose={() => setClosing(false)}
        onConfirm={() => {
          setClosing(false);
          void moveTo('fulfilled');
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

      <ShipOrderDialog
        key={shipping ? `ship-${order.id}` : 'ship-closed'}
        open={shipping}
        order={order}
        locations={leaves.filter((location) => location.isAvailable)}
        onClose={() => setShipping(false)}
        onShipped={async () => {
          await load();
          setShipments((count) => count + 1);
        }}
      />

      {/* Every location, unavailable ones included: returned stock usually
          belongs in exactly such a bin until someone has checked it. */}
      <ReturnOrderDialog
        key={returning ? `return-${order.id}` : 'return-closed'}
        open={returning}
        orderId={order.id}
        locations={leaves}
        onClose={() => setReturning(false)}
        onReturned={async () => {
          await load();
          setReturns((count) => count + 1);
        }}
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
