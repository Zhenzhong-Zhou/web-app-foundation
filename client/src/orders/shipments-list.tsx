import {
  Alert,
  Paper,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

import { api, ApiError } from '../lib/api';
import { formatDate, formatDay } from '../lib/format';
import type { Shipment } from '../lib/types';

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
          <Typography variant="subtitle2">
            {formatDate(shipment.createdAt)}
            {shipment.carrier ? ` · ${shipment.carrier}` : ''}
            {shipment.trackingNumber ? ` · ${shipment.trackingNumber}` : ''}
          </Typography>

          {shipment.note && (
            <Typography variant="body2" color="text.secondary">
              {shipment.note}
            </Typography>
          )}

          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>SKU</TableCell>
                  <TableCell>Lot</TableCell>
                  <TableCell>Expires</TableCell>
                  <TableCell align="right">Quantity</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {shipment.items.map((item) => (
                  <TableRow key={`${item.sku}-${item.lotCode ?? 'none'}`}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.lotCode ?? '—'}</TableCell>
                    <TableCell>
                      {item.expiresAt ? formatDay(item.expiresAt) : '—'}
                    </TableCell>
                    <TableCell align="right">{item.quantity}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ))}
    </Stack>
  );
}
