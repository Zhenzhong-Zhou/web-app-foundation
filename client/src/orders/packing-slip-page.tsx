import {
  Alert,
  Box,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useParams } from 'react-router-dom';

import { PrintBanner, PrintSheet } from '../components/print-sheet';
import { formatDate, formatDay } from '../lib/format';
import type { PackingSlip } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

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

  const {
    data: slip,
    error,
    loading,
  } = useResource<PackingSlip>(`/orders/${id}/shipments/${shipmentId}`);

  const showSkeleton = useDelayedFlag(loading);

  if (error) return <Alert severity="error">{error}</Alert>;

  if (!slip) {
    return showSkeleton ? <Skeleton height={320} /> : null;
  }

  const address = slip.shipTo;
  const voided = slip.voidedAt !== null;

  return (
    <PrintSheet
      backTo={`/orders/${slip.order.id}`}
      backLabel="Back to the order"
    >
      {/* A voided slip found in a drawer later must not pass for goods that
          left (PrintBanner says why it is bordered, not coloured). */}
      {slip.voidedAt && (
        <PrintBanner
          title="VOID — nothing on this slip left"
          detail={
            <>
              Voided {formatDate(slip.voidedAt)}: {slip.voidReason}
            </>
          }
        />
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

      {/* Not LotItemsTable, which links each lot to its trace: on paper a lot
          is a code to read, and a link only prints as an underline. */}
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
    </PrintSheet>
  );
}
