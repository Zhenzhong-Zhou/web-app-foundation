import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useNavigate, useParams } from 'react-router-dom';

import { HistoryButton } from '../audit/history-button';
import { useCan } from '../auth/permissions';
import { DetailLayout } from '../components/detail-layout';
import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { formatDay, SEPARATOR } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type {
  LineHold,
  Location,
  OrderDetail,
  OrderLine,
  OrderStatus,
} from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useTab } from '../lib/use-tab';
import { leavesOf } from '../locations/tree';
import { RaiseRmaDialog } from '../rmas/raise-rma-dialog';
import { COLOR_OF_TONE, STATUS_TONES } from '../theme/status';
import { AddOrderLineDialog } from './add-order-line-dialog';
import { CloseLineDialog } from './close-line-dialog';
import { CloseOrderDialog } from './close-order-dialog';
import { DuplicateOrderDialog } from './duplicate-order-dialog';
import { EditOrderDialog } from './edit-order-dialog';
import { EditOrderLineDialog } from './edit-order-line-dialog';
import { OrderLinesSection } from './order-lines-section';
import { OrderStatusActions } from './order-status-actions';
import { OrderSummary } from './order-summary';
import { ReceiveLineDialog } from './receive-line-dialog';
import { ReturnOrderDialog } from './return-order-dialog';
import { ReturnsList } from './returns-list';
import { ShipOrderDialog } from './ship-order-dialog';
import { ShipmentsList } from './shipments-list';
import { orderStatusLabel } from './status';

/**
 * The order's sections, in the order they happen (ADR-055). A purchase has
 * only its items: shipments and returns are a sale's.
 */
const SALE_TABS = ['items', 'shipments', 'returns'] as const;
type OrderTab = (typeof SALE_TABS)[number];

export function OrderDetailPage() {
  const intl = useIntl();
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

  // Before any early return: a hook's place in the order must not move.
  const [tab, setTab] = useTab<OrderTab>(SALE_TABS);

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

  const sale = order.direction === 'sale';
  const open: OrderTab = sale ? tab : 'items';

  /** The order's own actions, at the top of its summary. */
  const actions = (
    <>
      {canUpdate && (
        <OrderStatusActions
          order={order}
          working={working}
          onMove={moveTo}
          onCloseOrder={() => setClosing(true)}
        />
      )}
      <Stack direction="row" useFlexGap sx={{ flexWrap: 'wrap', gap: 1 }}>
        {canUpdate && (
          <Button
            variant="outlined"
            disabled={working}
            onClick={openDialog(() => setEditing(true))}
          >
            {intl.formatMessage({
              id: 'common.edit',
              defaultMessage: 'Edit',
            })}
          </Button>
        )}
        {canCreate && (
          <Button
            variant="outlined"
            disabled={working}
            onClick={openDialog(() => setDuplicating(true))}
          >
            {intl.formatMessage({
              id: 'orders.duplicate.action',
              defaultMessage: 'Duplicate',
            })}
          </Button>
        )}
        <HistoryButton resourceId={order.id} />
      </Stack>
    </>
  );

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'layout.nav.orders',
              defaultMessage: 'Orders',
            }),
            to: '/orders',
          },
        ]}
        // The order's own number when it has one, which is what people
        // quote; the partner's name for an order placed by phone without.
        title={order.reference ?? order.partnerName}
        titleTo={order.reference ? undefined : `/partners/${order.partnerId}`}
        status={{
          // What the order is, by name, rather than relying on CSS
          // capitalisation of the stored status; its tone from the one
          // table (ADR-055).
          label: orderStatusLabel(order.status, order.direction),
          color: COLOR_OF_TONE[STATUS_TONES.order[order.status]],
        }}
        subtitle={
          <>
            {[
              order.direction === 'purchase'
                ? intl.formatMessage({
                    id: 'orders.direction.buying',
                    defaultMessage: 'Buying',
                  })
                : intl.formatMessage({
                    id: 'orders.direction.selling',
                    defaultMessage: 'Selling',
                  }),
              order.isSample &&
                intl.formatMessage({
                  id: 'orders.subtitle.sample',
                  defaultMessage: 'sample',
                }),
              // The reference is the title when there is one.
              order.reference && order.partnerName,
              order.expectedAt &&
                intl.formatMessage(
                  {
                    id: 'orders.subtitle.expected',
                    defaultMessage: 'expected {day}',
                  },
                  { day: formatDay(order.expectedAt) },
                ),
            ]
              .filter(Boolean)
              .join(SEPARATOR)}
            {order.duplicatedFromId && (
              <>
                {SEPARATOR}
                <Link
                  component={RouterLink}
                  to={`/orders/${order.duplicatedFromId}`}
                  color="inherit"
                  underline="hover"
                >
                  {intl.formatMessage({
                    id: 'orders.subtitle.duplicatedFrom',
                    defaultMessage: 'duplicated from a previous order',
                  })}
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

      <DetailLayout<OrderTab>
        label={intl.formatMessage({
          id: 'orders.sections',
          defaultMessage: 'Order sections',
        })}
        summaryLabel={intl.formatMessage({
          id: 'orders.summary.label',
          defaultMessage: 'Summary',
        })}
        current={open}
        onChange={setTab}
        summary={
          <OrderSummary
            order={order}
            actions={actions}
            onShowReturns={() => setTab('returns')}
          />
        }
        tabs={[
          {
            id: 'items',
            label: intl.formatMessage({
              id: 'orders.items',
              defaultMessage: 'Items',
            }),
            content: (
              <Box sx={{ p: 2 }}>
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
              </Box>
            ),
          },
          ...(sale
            ? [
                {
                  id: 'shipments' as const,
                  label: intl.formatMessage({
                    id: 'orders.shipments.title',
                    defaultMessage: 'Shipments',
                  }),
                  content: (
                    <Box sx={{ p: 2 }}>
                      <ShipmentsList
                        orderId={order.id}
                        refreshKey={shipments}
                        // Closed too: voiding a shipment that never left
                        // reopens the order.
                        canVoid={
                          canShip &&
                          (order.status === 'confirmed' ||
                            order.status === 'fulfilled')
                        }
                        orderClosed={order.status === 'fulfilled'}
                        canViewInvoices={canViewInvoices}
                        canInvoice={canInvoice && !order.isSample}
                        onVoided={async () => {
                          // The order changed too: fulfilled quantities,
                          // outstanding and holds.
                          await load();
                          setShipments((count) => count + 1);
                        }}
                      />
                    </Box>
                  ),
                },
                {
                  id: 'returns' as const,
                  label: intl.formatMessage({
                    id: 'layout.nav.returns',
                    defaultMessage: 'Returns',
                  }),
                  content: (
                    <Box sx={{ p: 2 }}>
                      <ReturnsList orderId={order.id} refreshKey={returns} />
                    </Box>
                  ),
                },
              ]
            : []),
        ]}
      />

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
