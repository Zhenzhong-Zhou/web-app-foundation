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
import { Link as RouterLink } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import type { Shipment } from '../lib/types';
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
 */
export function ShipmentsList({
  orderId,
  refreshKey,
  canVoid,
  onVoided,
}: {
  orderId: string;
  refreshKey: number;
  /** orders.ship on a confirmed order; the server refuses anything else. */
  canVoid: boolean;
  /** The order changes too — fulfilled quantities and holds — so the page reloads both. */
  onVoided: () => Promise<void> | void;
}) {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [voiding, setVoiding] = useState<Shipment | null>(null);

  useEffect(() => {
    let ignore = false;

    void api<Shipment[]>(`/orders/${orderId}/shipments`)
      .then((rows) => {
        if (!ignore) {
          setShipments(rows);
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
  }, [orderId, refreshKey]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!shipments) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        Shipments
      </Typography>

      {shipments.length === 0 && (
        <Typography variant="body2" color="text.secondary">
          Nothing has shipped against this order yet.
        </Typography>
      )}

      {shipments.map((shipment) => {
        const voided = shipment.voidedAt !== null;

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
              {canVoid && !voided && (
                <Button
                  variant="text"
                  size="small"
                  color="error"
                  onClick={openDialog(() => setVoiding(shipment))}
                >
                  Void
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
        onClose={() => setVoiding(null)}
        onVoided={onVoided}
      />
    </Stack>
  );
}
