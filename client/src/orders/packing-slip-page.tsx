import {
  Alert,
  Box,
  Button,
  GlobalStyles,
  Link,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink, useParams } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDate, formatDay } from '../lib/format';
import type { PackingSlip } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';

/**
 * One shipment on paper (ADR-041).
 *
 * A print-ready page rather than a generated PDF: the browser's own Print
 * gives paper or "Save as PDF" with no PDF library to keep up, and what
 * prints is exactly what is on screen. Print CSS hides the app's chrome —
 * the top bar and anything marked no-print — so the sheet is the slip alone.
 *
 * The lot and expiry columns are the reason it exists beyond a courtesy: a
 * customer checking a delivery, or a recall a year later, reads them here.
 */
export function PackingSlipPage() {
  const { id, shipmentId } = useParams<{ id: string; shipmentId: string }>();

  const [slip, setSlip] = useState<PackingSlip | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loading = slip === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    void api<PackingSlip>(`/orders/${id}/shipments/${shipmentId}`)
      .then((result) => {
        if (!ignore) setSlip(result);
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(
            caught instanceof ApiError
              ? caught.message
              : 'Could not reach the server.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [id, shipmentId]);

  if (error) return <Alert severity="error">{error}</Alert>;

  if (!slip) {
    return showSkeleton ? <Skeleton height={320} /> : null;
  }

  const address = slip.shipTo;
  const voided = slip.voidedAt !== null;

  return (
    <Stack spacing={3} sx={{ maxWidth: 800 }}>
      {/* Only the slip on paper: the app bar, the nav and the buttons are
          for the screen. Black on white regardless of the theme, because a
          dark-mode page printed as-is wastes a cartridge. */}
      <GlobalStyles
        styles={{
          '@media print': {
            'header, nav, .no-print': { display: 'none !important' },
            body: { background: '#fff !important', color: '#000 !important' },
            '@page': { margin: '16mm' },
          },
        }}
      />

      <Stack
        direction="row"
        spacing={2}
        className="no-print"
        sx={{ alignItems: 'center' }}
      >
        <Link component={RouterLink} to={`/orders/${slip.order.id}`}>
          Back to the order
        </Link>
        <Box sx={{ flexGrow: 1 }} />
        <Button onClick={() => window.print()}>Print</Button>
      </Stack>

      {/* On paper too, and bordered rather than coloured: a voided slip
          found in a drawer later must not pass for goods that left, and a
          coloured background is the first thing a printer drops. */}
      {slip.voidedAt && (
        <Box sx={{ border: 2, borderColor: 'error.main', p: 2 }}>
          <Typography variant="h6" component="p" color="error">
            VOID — nothing on this slip left
          </Typography>
          <Typography variant="body2">
            Voided {formatDate(slip.voidedAt)}: {slip.voidReason}
          </Typography>
        </Box>
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            Packing slip
          </Typography>
          <Typography variant="body2">{slip.organizationName}</Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2">
            Shipped {formatDate(slip.createdAt)}
          </Typography>
          {slip.order.reference && (
            <Typography variant="body2">
              Order {slip.order.reference}
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <Box>
          <Typography variant="overline">Ship to</Typography>
          <Typography>{slip.order.partnerName}</Typography>
          {address && (
            <>
              {address.label && <Typography>{address.label}</Typography>}
              <Typography>{address.line1}</Typography>
              {address.line2 && <Typography>{address.line2}</Typography>}
              <Typography>
                {[address.city, address.region, address.postalCode]
                  .filter(Boolean)
                  .join(', ')}
              </Typography>
              <Typography>{address.country}</Typography>
            </>
          )}
        </Box>

        <Box>
          <Typography variant="overline">Shipment</Typography>
          <Typography>From {slip.fromLocationName}</Typography>
          {slip.carrier && <Typography>Carrier: {slip.carrier}</Typography>}
          {slip.trackingNumber && (
            <Typography>Tracking: {slip.trackingNumber}</Typography>
          )}
        </Box>
      </Stack>

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Item</TableCell>
            <TableCell>Lot</TableCell>
            <TableCell>Expires</TableCell>
            <TableCell align="right">Quantity</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {slip.items.map((item) => (
            <TableRow key={`${item.sku}-${item.lotCode ?? 'none'}`}>
              <TableCell>{item.sku}</TableCell>
              <TableCell>{item.description}</TableCell>
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

      {slip.note && <Typography variant="body2">{slip.note}</Typography>}

      {/* For the person unpacking: a paper slip is often signed and kept.
          Not on a voided one — nothing arrived to sign for. */}
      {!voided && (
        <Typography variant="body2" sx={{ pt: 4 }}>
          Received by: ______________________ Date: ____________
        </Typography>
      )}
    </Stack>
  );
}
