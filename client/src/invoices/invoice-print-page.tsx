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
import type { InvoiceDetail, InvoiceLine } from '../lib/types';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  PrintBanner,
  PrintParty,
  PrintSheet,
  PrintTotals,
} from './print-sheet';

/**
 * An invoice on paper (ADR-046), laid out as the packing slip is.
 *
 * An issued invoice prints from what was stored at issue — its number,
 * amounts and both parties as they were that day — so a reprint in a year
 * reads exactly as the original did.
 *
 * A draft prints too, for someone to check before issuing, but marked
 * DRAFT with no number, so it cannot be mistaken for one that was sent. Its
 * seller and bill-to are not copied until issue, so a draft shows only the
 * customer's name. A voided invoice prints with VOID and the reason, as a
 * voided packing slip does.
 */
export function InvoicePrintPage() {
  const { id } = useParams<{ id: string }>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  const showSkeleton = useDelayedFlag(invoice === null && error === null);

  useEffect(() => {
    let ignore = false;

    void api<{ invoice: InvoiceDetail }>(`/invoices/${id}`)
      .then((response) => {
        if (!ignore) setInvoice(response.invoice);
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
  if (!invoice) return showSkeleton ? <Skeleton height={320} /> : null;

  const isDraft = invoice.status === 'draft';

  const netOf = (line: InvoiceLine) =>
    isDraft
      ? (invoice.preview?.lines.find((row) => row.id === line.id)?.netAmount ??
        null)
      : line.netAmount;

  return (
    <PrintSheet
      backTo={`/invoices/${invoice.id}`}
      backLabel="Back to the invoice"
    >
      {isDraft && (
        <PrintBanner
          title="DRAFT — not an invoice"
          detail="Not yet issued: it has no number and nothing is owed on it."
        />
      )}

      {invoice.status === 'voided' && (
        <PrintBanner
          title="VOID — nothing is owed on this invoice"
          detail={`Voided${invoice.voidedAt ? ` ${formatDay(invoice.voidedAt)}` : ''}: ${invoice.voidReason ?? ''}${
            invoice.creditNotes.length > 0
              ? ` — reversed by ${invoice.creditNotes.map((note) => note.number).join(', ')}`
              : ''
          }`}
        />
      )}

      <Stack direction="row" sx={{ justifyContent: 'space-between' }}>
        <Box>
          <Typography variant="h5" component="h1">
            Invoice
          </Typography>
          {invoice.number && (
            <Typography variant="h6" component="p">
              {invoice.number}
            </Typography>
          )}
        </Box>

        <Box sx={{ textAlign: 'right' }}>
          {invoice.invoiceDate && (
            <Typography variant="body2">
              Date {formatDay(invoice.invoiceDate)}
            </Typography>
          )}
          {invoice.dueDate && (
            <Typography variant="body2">
              Due {formatDay(invoice.dueDate)}
            </Typography>
          )}
          {invoice.orderReference && (
            <Typography variant="body2">
              Your order {invoice.orderReference}
            </Typography>
          )}
        </Box>
      </Stack>

      <Stack direction="row" spacing={6}>
        <PrintParty
          heading="From"
          name={invoice.sellerName}
          lines={[
            invoice.sellerLine1,
            invoice.sellerLine2,
            invoice.sellerCity,
            invoice.sellerRegion,
            invoice.sellerPostalCode,
            invoice.sellerCountry,
          ]}
          extra={
            invoice.sellerTaxNumber && (
              <Typography variant="body2">
                Tax registration {invoice.sellerTaxNumber}
              </Typography>
            )
          }
        />

        <PrintParty
          heading="Bill to"
          name={invoice.billToName ?? invoice.partnerName}
          lines={[
            invoice.billToLine1,
            invoice.billToLine2,
            invoice.billToCity,
            invoice.billToRegion,
            invoice.billToPostalCode,
            invoice.billToCountry,
          ]}
        />

        {invoice.shipToLine1 && (
          <PrintParty
            heading="Shipped to"
            name={invoice.shipToLabel}
            lines={[
              invoice.shipToLine1,
              invoice.shipToLine2,
              invoice.shipToCity,
              invoice.shipToRegion,
              invoice.shipToPostalCode,
              invoice.shipToCountry,
            ]}
          />
        )}
      </Stack>

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
          {invoice.lines.map((line) => (
            <TableRow key={line.id}>
              <TableCell>{line.sku}</TableCell>
              <TableCell>{line.description}</TableCell>
              <TableCell align="right">{Number(line.quantity)}</TableCell>
              <TableCell align="right">
                {formatMoney(line.unitPrice, invoice.currency)}
              </TableCell>
              <TableCell>{line.taxCodeName ?? '—'}</TableCell>
              <TableCell align="right">
                {formatMoney(netOf(line), invoice.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <PrintTotals
        currency={invoice.currency}
        subtotal={
          isDraft ? (invoice.preview?.subtotal ?? null) : invoice.subtotal
        }
        taxes={(isDraft ? invoice.preview?.taxes : invoice.taxes) ?? []}
        total={isDraft ? (invoice.preview?.total ?? null) : invoice.total}
        totalLabel="Total"
      />

      {invoice.note && <Typography variant="body2">{invoice.note}</Typography>}
    </PrintSheet>
  );
}
