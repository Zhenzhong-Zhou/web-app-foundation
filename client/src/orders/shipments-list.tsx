import {
  Alert,
  Box,
  Button,
  Chip,
  Link,
  Paper,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { InvoicePage, InvoiceSummary, Shipment } from '../lib/types';
import { LotItemsTable } from './lot-items-table';
import { VoidShipmentDialog } from './void-shipment-dialog';

/**
 * What has left against this order, newest first, lot by lot (ADR-041).
 *
 * The lot column is the point: it is the packing-slip line a customer asks
 * about and the forward half of a recall — which lots went to whom. An
 * untracked item shows no lot, because it never had one.
 *
 * Fetched on its own rather than folded into the order read, and refetched
 * when `refreshKey` changes after a shipment, so the order's own query stays
 * the size it was.
 *
 * A voided shipment stays in the list, struck through with its reason
 * (ADR-041): it was recorded, and hiding it would make its packing slip —
 * possibly printed already — impossible to explain.
 *
 * Each standing shipment is where its invoice starts (ADR-046): an invoice
 * bills exactly what one shipment carried. Once one stands, the shipment
 * links to it instead, and offers no Void — the server refuses a void while
 * an invoice stands, so the invoice is voided first.
 */
export function ShipmentsList({
  orderId,
  refreshKey,
  canVoid,
  orderClosed,
  canViewInvoices,
  canInvoice,
  onVoided,
}: {
  orderId: string;
  refreshKey: number;
  /** orders.ship on a confirmed or closed order; the server refuses anything else. */
  canVoid: boolean;
  /** Voiding a closed order's shipment reopens it, and the dialog says so. */
  orderClosed: boolean;
  /** invoices.view: whether to look up which shipments are billed. */
  canViewInvoices: boolean;
  /** invoices.create, on a sale that is not a sample — samples are never invoiced. */
  canInvoice: boolean;
  /** The order changes too — fulfilled quantities and holds — so the page reloads both. */
  onVoided: () => Promise<void> | void;
}) {
  const navigate = useNavigate();
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Shipment | null>(null);
  const [invoicing, setInvoicing] = useState<string | null>(null);
  const [invoiceError, setInvoiceError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    /**
     * The order's invoices beside its shipments, in one round trip, so a
     * shipment never shows "Create invoice" for a moment before its invoice
     * arrives. A hundred is the page cap and far above the shipments one
     * order has.
     */
    void Promise.all([
      api<Shipment[]>(`/orders/${orderId}/shipments`),
      canViewInvoices
        ? api<InvoicePage>(`/invoices?orderId=${orderId}&limit=100`)
        : Promise.resolve(null),
    ])
      .then(([rows, page]) => {
        if (!ignore) {
          setShipments(rows);
          setInvoices(page?.entries ?? []);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load shipments.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [orderId, refreshKey, canViewInvoices]);

  /**
   * A draft for exactly what this shipment carried, then straight to it:
   * pricing and tax are set on the invoice, not here. A refusal — an item
   * with no price on the order, say — is shown above the list.
   */
  async function createInvoice(shipmentId: string) {
    setInvoicing(shipmentId);
    setInvoiceError(null);

    try {
      const { invoice } = await api<{ invoice: { id: string } }>('/invoices', {
        method: 'POST',
        body: JSON.stringify({ shipmentId }),
      });
      navigate(`/invoices/${invoice.id}`);
    } catch (caught) {
      setInvoiceError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
      setInvoicing(null);
    }
  }

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!shipments) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        Shipments
      </Typography>

      {invoiceError && <Alert severity="error">{invoiceError}</Alert>}

      {shipments.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing has shipped against this order yet.
        </Typography>
      )}

      {shipments.map((shipment) => {
        const voided = shipment.voidedAt !== null;

        // A voided invoice stays on record but no longer bills the shipment.
        const invoice = invoices.find(
          (row) => row.shipmentId === shipment.id && row.status !== 'voided',
        );

        return (
          <Paper key={shipment.id} variant="outlined" sx={{ p: 2 }}>
            <Stack direction="row" spacing={2} sx={{ alignItems: 'baseline' }}>
              <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
                {formatDate(shipment.createdAt)}
                {shipment.carrier ? ` · ${shipment.carrier}` : ''}
                {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
              </Typography>

              {/* Beside the heading, not inside it: a chip is a div, and a
                  div inside the heading's h6 is invalid markup. */}
              {voided && <Chip label="Voided" size="small" />}

              {/* Before the slip link, so the destructive action is not
                  where the eye lands first. */}
              {canVoid && !voided && !invoice && (
                <Button
                  variant="text"
                  size="small"
                  color="error"
                  onClick={openDialog(() => setVoiding(shipment))}
                >
                  Void
                </Button>
              )}

              {invoice && (
                <Link
                  component={RouterLink}
                  to={`/invoices/${invoice.id}`}
                  variant="body2"
                >
                  {invoice.number
                    ? `Invoice ${invoice.number}`
                    : 'Draft invoice'}
                </Link>
              )}

              {canInvoice && !voided && !invoice && (
                <Button
                  variant="text"
                  size="small"
                  disabled={invoicing !== null}
                  onClick={() => void createInvoice(shipment.id)}
                >
                  {invoicing === shipment.id ? 'Creating…' : 'Create invoice'}
                </Button>
              )}

              {/* Its own page, opened in a new tab: printing is a detour from
                  the order, not a step away from it. */}
              <Link
                component={RouterLink}
                to={`/orders/${orderId}/shipments/${shipment.id}/slip`}
                target="_blank"
                rel="noopener"
                variant="body2"
              >
                Packing slip
              </Link>
            </Stack>

            {shipment.voidedAt && (
              <Typography variant="body2" color="text.secondary">
                Voided {formatDate(shipment.voidedAt)}: {shipment.voidReason}.
                Everything on it went back where it came from.
              </Typography>
            )}

            {shipment.note && (
              <Typography variant="body2" color="text.secondary">
                {shipment.note}
              </Typography>
            )}

            {/* Struck through rather than hidden: what it carried is what
                the voided slip says, and someone may be holding that slip. */}
            <Box
              sx={
                voided
                  ? { opacity: 0.6, '& td': { textDecoration: 'line-through' } }
                  : undefined
              }
            >
              <LotItemsTable items={shipment.items} />
            </Box>
          </Paper>
        );
      })}

      {/* Keyed on the shipment, so the reason starts empty each time. */}
      <VoidShipmentDialog
        key={voiding?.id ?? 'none'}
        open={voiding !== null}
        orderId={orderId}
        shipment={voiding}
        orderClosed={orderClosed}
        onClose={() => setVoiding(null)}
        onVoided={onVoided}
      />
    </Stack>
  );
}
