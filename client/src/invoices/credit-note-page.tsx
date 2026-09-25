import {
  Alert,
  Link,
  Paper,
  Skeleton,
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
import { Link as RouterLink, useParams } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { formatDay, formatMoney } from '../lib/format';
import type { CreditNoteDetail } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { formatRate } from '../settings/tax-rate';
import { oneLine } from './calendar-day';

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

/**
 * One credit note, read-only (ADR-046). It never changes after it is
 * issued, so there is nothing to do here but read it — and, in the next
 * step, print it. The amounts are positive: a credit note states what it
 * gives back, not a negative invoice.
 */
export function CreditNotePage() {
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
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, [id]);

  if (!note) {
    if (error) return <Alert severity="error">{error}</Alert>;
    return showSkeleton ? <Skeleton height={240} /> : null;
  }

  return (
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          { label: 'Invoices', to: '/invoices' },
          {
            label: note.invoiceNumber ?? 'Invoice',
            to: `/invoices/${note.invoiceId}`,
          },
        ]}
        title={note.number}
        subtitle={`${note.billToName} · ${formatDay(note.creditDate)}`}
        status={{
          label: note.isVoid ? 'Voids invoice' : 'Credit',
          color: 'default',
        }}
      />

      <Alert severity="info">
        {note.isVoid ? 'Reverses ' : 'Credits against '}
        <Link component={RouterLink} to={`/invoices/${note.invoiceId}`}>
          {note.invoiceNumber}
        </Link>
        {note.invoiceDate ? ` of ${formatDay(note.invoiceDate)}` : ''}. Reason:{' '}
        {note.reason}
      </Alert>

      <Paper variant="outlined">
        <TableContainer>
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
        </TableContainer>

        <Stack spacing={0.5} sx={{ p: 2, alignItems: 'flex-end' }}>
          <Typography variant="body2">
            Subtotal {formatMoney(note.subtotal, note.currency)}
          </Typography>
          {note.taxes.map((tax) => (
            <Typography key={`${tax.name}-${tax.rate}`} variant="body2">
              {tax.name} {formatRate(tax.rate)}{' '}
              {formatMoney(tax.amount, note.currency)}
            </Typography>
          ))}
          <Typography variant="body2" sx={{ fontWeight: 600 }}>
            Total credited {formatMoney(note.total, note.currency)}
          </Typography>
        </Stack>
      </Paper>

      <Stack direction={{ xs: 'column', md: 'row' }} spacing={2}>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">From</Typography>
          <Typography variant="body2">{note.sellerName}</Typography>
          <Typography variant="body2">
            {oneLine([
              note.sellerLine1,
              note.sellerLine2,
              note.sellerCity,
              note.sellerRegion,
              note.sellerPostalCode,
              note.sellerCountry,
            ])}
          </Typography>
        </Paper>
        <Paper variant="outlined" sx={{ p: 2, flex: 1 }}>
          <Typography variant="overline">To</Typography>
          <Typography variant="body2">{note.billToName}</Typography>
          <Typography variant="body2">
            {oneLine([
              note.billToLine1,
              note.billToLine2,
              note.billToCity,
              note.billToRegion,
              note.billToPostalCode,
              note.billToCountry,
            ])}
          </Typography>
        </Paper>
      </Stack>
    </Stack>
  );
}
