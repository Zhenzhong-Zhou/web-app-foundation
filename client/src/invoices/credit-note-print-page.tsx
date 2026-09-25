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
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import { api, ApiError } from '../lib/api';
import { formatDay, formatMoney } from '../lib/format';
import type { CreditNoteDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { PrintParty, PrintSheet, PrintTotals } from './print-sheet';

/**
 * A credit note on paper (ADR-046): the invoice's layout, stating what is
 * given back and which invoice it reverses. Amounts print positive — a
 * credit note says what it credits, not a negative invoice — and the
 * reason prints, because the customer reads it too.
 */
export function CreditNotePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [note, setNote] = useState<CreditNoteDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showSkeleton = useDelayedFlag(note === null && error === null);

  useEffect(() => {
    let ignore = false;

    void api<{ creditNote: CreditNoteDetail }>(`/credit-notes/${id}`)
      .then((response) => {
        if (!ignore) setNote(response.creditNote);
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
  }, [id]);

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

      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>SKU</TableCell>
            <TableCell>Item</TableCell>
            <TableCell align="right">Quantity</TableCell>
            <TableCell align="right">Unit price</TableCell>
            <TableCell>Tax</TableCell>
            <TableCell align="right">Amount</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {note.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.sku}</TableCell>
              <TableCell>{line.description}</TableCell>
              <TableCell align="right">{Number(line.quantity)}</TableCell>
              <TableCell align="right">
                {formatMoney(line.unitPrice, note.currency)}
              </TableCell>
              <TableCell>{line.taxCodeName ?? '—'}</TableCell>
              <TableCell align="right">
                {formatMoney(line.netAmount, note.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

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
