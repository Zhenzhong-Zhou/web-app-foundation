import { Alert, Box, Skeleton, Stack, Typography } from '@mui/material';
import { useParams } from 'react-router-dom';

import {
  PrintLines,
  PrintParty,
  PrintSheet,
  PrintTotals,
} from '../components/print-sheet';
import { formatDay } from '../lib/format';
import type { CreditNoteDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';

/**
 * A credit note on paper (ADR-046): the invoice's layout, stating what is
 * given back and which invoice it reverses. Amounts print positive — a
 * credit note says what it credits, not a negative invoice — and the
 * reason prints, because the customer reads it too.
 */
export function CreditNotePrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data, error, loading } = useResource<{
    creditNote: CreditNoteDetail;
  }>(`/credit-notes/${id}`);
  const note = data?.creditNote ?? null;

  const showSkeleton = useDelayedFlag(loading);

  if (error) return <Alert severity="error">{error}</Alert>;
  if (!note) return showSkeleton ? <Skeleton height={320} /> : null;

  return (
    <PrintSheet
      backTo={`/credit-notes/${note.id}`}
      backLabel="Back to the credit note"
    >
      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            Credit note
          </Typography>
          <Typography variant="h6" component="p">
            {note.number}
          </Typography>
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          <Typography variant="body2">
            Date {formatDay(note.creditDate)}
          </Typography>
          <Typography variant="body2">
            {note.isVoid ? 'Voids' : 'Credits'} invoice {note.invoiceNumber}
            {note.invoiceDate ? ` of ${formatDay(note.invoiceDate)}` : ''}
          </Typography>
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <PrintParty
          heading="From"
          name={note.sellerName}
          lines={[
            note.sellerLine1,
            note.sellerLine2,
            note.sellerCity,
            note.sellerRegion,
            note.sellerPostalCode,
            note.sellerCountry,
          ]}
          extra={
            note.sellerTaxNumber && (
              <Typography variant="body2">
                Tax registration {note.sellerTaxNumber}
              </Typography>
            )
          }
        />

        <PrintParty
          heading="To"
          name={note.billToName}
          lines={[
            note.billToLine1,
            note.billToLine2,
            note.billToCity,
            note.billToRegion,
            note.billToPostalCode,
            note.billToCountry,
          ]}
        />
      </Stack>

      <Typography variant="body2">Reason: {note.reason}</Typography>

      <PrintLines
        currency={note.currency}
        lines={note.lines.map((line) => ({ ...line, amount: line.netAmount }))}
      />

      <PrintTotals
        currency={note.currency}
        subtotal={note.subtotal}
        taxes={note.taxes}
        total={note.total}
        totalLabel="Total credited"
      />
    </PrintSheet>
  );
}
