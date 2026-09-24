import { Alert, Link, Paper, Stack, Typography } from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDate } from '../lib/format';
import type { Shipment } from '../lib/types';
import { LotItemsTable } from './lot-items-table';

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
 */
export function ShipmentsList({
  orderId,
  refreshKey,
}: {
  orderId: string;
  refreshKey: number;
}) {
  const [shipments, setShipments] = useState<Shipment[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

      {shipments.map((shipment) => (
        <Paper key={shipment.id} variant="outlined" sx={{ p: 2 }}>
          <Stack direction="row" sx={{ alignItems: 'baseline' }}>
            <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
              {formatDate(shipment.createdAt)}
              {shipment.carrier ? ` · ${shipment.carrier}` : ''}
              {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
            </Typography>

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

          {shipment.note && (
            <Typography variant="body2" color="text.secondary">
              {shipment.note}
            </Typography>
          )}

          <LotItemsTable items={shipment.items} />
        </Paper>
      ))}
    </Stack>
  );
}
