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
import { defineMessages, useIntl } from 'react-intl';
import { useParams } from 'react-router-dom';

import { useDocumentText } from '../components/document-text';
import { PrintBanner, PrintSheet } from '../components/print-sheet';
import { PRINTED } from '../components/printed-words';
import { formatDate, formatDay, formatQuantity, NO_VALUE } from '../lib/format';
import type { PackingSlip } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { unitLabel } from '../products/units';

const WORDS = defineMessages({
  title: { id: 'documents.packingSlip', defaultMessage: 'Packing slip' },
  void: {
    id: 'documents.packingSlip.void',
    defaultMessage: 'VOID — nothing on this slip left',
  },
  shipment: { id: 'documents.shipment', defaultMessage: 'Shipment' },
});

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
  const intl = useIntl();
  const { id, shipmentId } = useParams<{ id: string; shipmentId: string }>();

  const {
    data: slip,
    error,
    loading,
  } = useResource<PackingSlip>(`/orders/${id}/shipments/${shipmentId}`);

  const showSkeleton = useDelayedFlag(loading);
  // In the languages fixed when it shipped (ADR-054).
  const doc = useDocumentText(
    slip
      ? { language: slip.language, secondLanguage: slip.secondLanguage }
      : null,
  );

  if (error) return <Alert severity="error">{error}</Alert>;

  if (!slip || !doc) {
    return showSkeleton ? <Skeleton height={320} /> : null;
  }

  const address = slip.shipTo;
  const voided = slip.voidedAt !== null;

  return (
    <PrintSheet
      backTo={`/orders/${slip.order.id}`}
      backLabel={intl.formatMessage({
        id: 'documents.backToOrder',
        defaultMessage: 'Back to the order',
      })}
      languages={doc.languages}
    >
      {/* A voided slip found in a drawer later must not pass for goods that
          left (PrintBanner says why it is bordered, not coloured). */}
      {slip.voidedAt && (
        <PrintBanner
          title={doc.label(WORDS.void)}
          detail={doc.lines((words) =>
            words.formatMessage(
              {
                id: 'documents.voidedOn',
                defaultMessage: 'Voided {date}: {reason}',
              },
              {
                date: formatDate(slip.voidedAt!, doc.locale),
                reason: slip.voidReason ?? '',
              },
            ),
          )}
        />
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            {doc.label(WORDS.title)}
          </Typography>
          <Typography variant="body2">{slip.organizationName}</Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2">
            {doc.join((words) =>
              words.formatMessage(
                { id: 'documents.shippedOn', defaultMessage: 'Shipped {date}' },
                { date: formatDate(slip.createdAt, doc.locale) },
              ),
            )}
          </Typography>
          {slip.order.reference && (
            <Typography variant="body2">
              {doc.join((words) =>
                words.formatMessage(
                  {
                    id: 'documents.orderReference',
                    defaultMessage: 'Order {reference}',
                  },
                  { reference: slip.order.reference },
                ),
              )}
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <Box>
          <Typography variant="overline">
            {doc.label(PRINTED.shipTo)}
          </Typography>
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
          <Typography variant="overline">
            {doc.label(WORDS.shipment)}
          </Typography>
          <Typography>
            {doc.join((words) =>
              words.formatMessage(
                {
                  id: 'documents.fromLocation',
                  defaultMessage: 'From {place}',
                },
                { place: slip.fromLocationName },
              ),
            )}
          </Typography>
          {slip.carrier && (
            <Typography>
              {doc.join((words) =>
                words.formatMessage(
                  {
                    id: 'documents.carrier',
                    defaultMessage: 'Carrier: {carrier}',
                  },
                  { carrier: slip.carrier },
                ),
              )}
            </Typography>
          )}
          {slip.trackingNumber && (
            <Typography>
              {doc.join((words) =>
                words.formatMessage(
                  {
                    id: 'documents.tracking',
                    defaultMessage: 'Tracking: {number}',
                  },
                  { number: slip.trackingNumber },
                ),
              )}
            </Typography>
          )}
        </Box>
      </Stack>

      {/* Not LotItemsTable, which links each lot to its trace: on paper a lot
          is a code to read, and a link only prints as an underline. */}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{doc.label(PRINTED.sku)}</TableCell>
            <TableCell>{doc.label(PRINTED.item)}</TableCell>
            <TableCell>{doc.label(PRINTED.lot)}</TableCell>
            <TableCell>{doc.label(PRINTED.expires)}</TableCell>
            <TableCell align="right">{doc.label(PRINTED.quantity)}</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {slip.items.map((item) => (
            <TableRow key={`${item.sku}-${item.lotCode ?? 'none'}`}>
              <TableCell>{item.sku}</TableCell>
              <TableCell>{item.description}</TableCell>
              <TableCell>{item.lotCode ?? NO_VALUE}</TableCell>
              <TableCell>
                {item.expiresAt
                  ? formatDay(item.expiresAt, doc.locale)
                  : NO_VALUE}
              </TableCell>
              {/* The figure once, the unit in each language. */}
              <TableCell align="right">
                {[
                  formatQuantity(item.quantity, doc.locale),
                  doc.join((words) => unitLabel(item.unitOfMeasure, words)),
                ].join(' ')}
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
          {doc.join((words) =>
            words.formatMessage(
              {
                id: 'documents.receivedBy',
                defaultMessage: 'Received by: {line} Date: {shortLine}',
              },
              { line: '______________________', shortLine: '____________' },
            ),
          )}
        </Typography>
      )}
    </PrintSheet>
  );
}
