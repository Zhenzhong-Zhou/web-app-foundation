import {
  Alert,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { formatDay } from '../lib/format';
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
import { RaiseRmaDialog } from '../rmas/raise-rma-dialog';
import { AddOrderLineDialog } from './add-order-line-dialog';
import { CloseLineDialog } from './close-line-dialog';
import { CloseOrderDialog } from './close-order-dialog';
import { DuplicateOrderDialog } from './duplicate-order-dialog';
import { EditOrderDialog } from './edit-order-dialog';
import { EditOrderLineDialog } from './edit-order-line-dialog';
import { OrderLinesSection } from './order-lines-section';
import { ReceiveLineDialog } from './receive-line-dialog';
import { ReturnOrderDialog } from './return-order-dialog';
import { ReturnsList } from './returns-list';
import { ShipOrderDialog } from './ship-order-dialog';
import { ShipmentsList } from './shipments-list';
import { DONE } from './status';

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
 * rule being implemented. Fulfilled and cancelled are terminal by hand: an
 * order that turns out wrong is corrected by an adjustment movement, not by
 * reopening the document (ADR-023). The one way back is voiding a shipment
 * that never left, which reopens the order (ADR-046).
 */
const NEXT_STATUSES: Record<OrderStatus, OrderStatus[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['fulfilled', 'cancelled'],
  fulfilled: [],
  cancelled: [],
};

/**
 * Button labels. What clicking does, not what the order is.
 *
 * Closing is "Close order" in both directions (#24). It was "Mark shipped"
 * and "Mark received", which read as the act of shipping or receiving —
 * those have their own buttons, and closing says only that nothing more
 * is coming.
 */
function transitionLabel(next: OrderStatus): string {
  if (next === 'fulfilled') return 'Close order';
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
  const can = useCan();
  const navigate = useNavigate();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Why an item just added has no price, when its list could not give one
  // (ADR-049). Dismissed by the person, or replaced by the next notice.
  const [priceNotice, setPriceNotice] = useState<string | null>(null);
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

  const [authorizing, setAuthorizing] = useState(false);

  const canUpdate = can('orders.update');
  const canReceive = can('orders.receive');
  const canShip = can('orders.ship');
  const canCreate = can('orders.create');
  const canViewInvoices = can('invoices.view');
  const canInvoice = can('invoices.create');
  const canAuthorize = can('return_authorizations.create');
  const loading = order === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    if (!id) return;
    try {
      setOrder(await api<OrderDetail>(`/orders/${id}`));
      setError(null);
    } catch (caught) {
      setError(messageFor(caught));
    }
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

  /**
   * An RMA is customer service's, not the dock's (ADR-047), so it has its
   * own permission, but the same moment as a return: once anything shipped.
   */
  const authorizable =
    canAuthorize &&
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

      {priceNotice && (
        <Alert severity="info" onClose={() => setPriceNotice(null)}>
          {priceNotice}
        </Alert>
      )}

      {order.note && (
        <Paper variant="outlined" sx={{ p: 2 }}>
          <Typography variant="body2" sx={{ whiteSpace: 'pre-wrap' }}>
            {order.note}
          </Typography>
        </Paper>
      )}

      <OrderLinesSection
        order={order}
        holds={holds}
        working={working}
        canUpdate={canUpdate}
        receivable={receivable}
        amendable={amendable}
        shippable={shippable}
        returnable={returnable}
        authorizable={authorizable}
        onAddLine={() => setAddingLine(true)}
        onAuthorize={() => setAuthorizing(true)}
        onTakeReturn={() => setReturning(true)}
        onShip={() => setShipping(true)}
        onReceive={setReceiving}
        onEditLine={setEditingLine}
        onCloseLine={setClosingLine}
        onLineAction={lineAction}
      />

      {order.direction === 'sale' && (
        <ShipmentsList
          orderId={order.id}
          refreshKey={shipments}
          // Closed too: voiding a shipment that never left reopens the order.
          canVoid={
            canShip &&
            (order.status === 'confirmed' || order.status === 'fulfilled')
          }
          orderClosed={order.status === 'fulfilled'}
          canViewInvoices={canViewInvoices}
          canInvoice={canInvoice && !order.isSample}
          onVoided={async () => {
            // The order changed too: fulfilled quantities, outstanding and holds.
            await load();
            setShipments((count) => count + 1);
          }}
        />
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
            .filter(
              (next) =>
                next === 'cancelled' &&
                !order.lines.some((line) => Number(line.quantityFulfilled) > 0),
            )
            .map((next) => (
              <Button
                key={next}
                variant="text"
                color="error"
                disabled={working}
                onClick={() => void moveTo(next)}
              >
                {transitionLabel(next)}
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
                {transitionLabel(next)}
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
        onAdded={async (notice) => {
          setPriceNotice(notice);
          await load();
        }}
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
        canSeeRmas={can('return_authorizations.view')}
        onClose={() => setReturning(false)}
        onReturned={async () => {
          await load();
          setReturns((count) => count + 1);
        }}
      />

      <RaiseRmaDialog
        key={authorizing ? `rma-${order.id}` : 'rma-closed'}
        open={authorizing}
        orderId={order.id}
        isSample={order.isSample}
        lines={order.lines}
        canViewInvoices={canViewInvoices}
        onClose={() => setAuthorizing(false)}
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
