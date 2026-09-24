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
import type { OrderReturn } from '../lib/types';

/**
 * What came back against this order, newest first, lot by lot (ADR-043).
 *
 * Hidden entirely until there is one: most orders never have a return, and
 * an empty section on every sale would be noise. Refetched when `refreshKey`
 * changes after a return is taken.
 */
export function ReturnsList({
  orderId,
  refreshKey,
}: {
  orderId: string;
  refreshKey: number;
}) {
  const [returns, setReturns] = useState<OrderReturn[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    void api<OrderReturn[]>(`/orders/${orderId}/returns`)
      .then((rows) => {
        if (!ignore) {
          setReturns(rows);
          setError(null);
        }
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not load returns.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [orderId, refreshKey]);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!returns?.length) return null;

  return (
    <Stack spacing={1}>
      <Typography variant="h6" component="h2">
        Returns
      </Typography>

      {returns.map((entry) => (
        <Paper key={entry.id} variant="outlined" sx={{ p: 2 }}>
          <Typography variant="subtitle2">
            {formatDate(entry.createdAt)}
            {entry.reason ? ` · ${entry.reason}` : ''}
          </Typography>

          {entry.note && (
            <Typography variant="body2" color="text.secondary">
              {entry.note}
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
                {entry.items.map((item) => (
                  <TableRow key={`${item.sku}-${item.lotCode ?? 'none'}`}>
                    <TableCell>{item.sku}</TableCell>
                    <TableCell>{item.lotCode ?? '—'}</TableCell>
                    <TableCell>
                      {item.expiresAt ? formatDay(item.expiresAt) : '—'}
                    </TableCell>
                    <TableCell align="right">
                      {item.quantity} {item.unitOfMeasure}
                    </TableCell>
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
