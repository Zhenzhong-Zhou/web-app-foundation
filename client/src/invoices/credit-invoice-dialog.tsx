import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';

import { FormError } from '../components/form-error';
import { api, messageFor } from '../lib/api';
import { formatMoney } from '../lib/format';
import type {
  InvoiceDetail,
  InvoiceTax,
  ReturnAuthorizationDetail,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { formatRate } from '../settings/tax-rate';
import { todayLocal } from './calendar-day';

/** A numeric(18,4) of nothing always reads '0.0000' (ADR-025). */
const NOTHING = '0.0000';

/** A quantity of nothing, recognised as text rather than parsed (ADR-025). */
function isNothing(quantity: string | undefined): boolean {
  return /^\s*0*(\.0*)?\s*$/.test(quantity ?? '');
}

interface Row {
  quantity: string;
  unitPrice: string;
  returnAuthorizationLineId?: string;
}

interface CreditPreview {
  subtotal: string;
  taxTotal: string;
  total: string;
  taxes: InvoiceTax[];
}

/**
 * Credits part of an issued invoice (ADR-047): returned goods under an RMA,
 * or a credit without goods — a price correction, goodwill, an
 * uncollectable debt.
 *
 * Each line takes a quantity and a unit price. The price starts at the
 * invoice's and can be lowered, never raised: a restocking fee is the units
 * at a lower price, a price correction every unit at the difference.
 *
 * The figures are the server's preview, asked for as the person types and
 * computed the way issuing stores them, so what is confirmed is what is
 * issued. A refusal — more than a line has left, more than an RMA allowed —
 * shows in place of the figures, before anything is sent.
 *
 * Opened from an RMA, the lines it resolves as credit are filled with what
 * came back (or, if no goods were expected, what was authorized) — unless
 * part is already credited, in which case the dialog shows both figures
 * and leaves the quantity to the person rather than subtracting decimals.
 */
export function CreditInvoiceDialog({
  invoice,
  rma,
  open,
  onClose,
  onIssued,
}: {
  invoice: InvoiceDetail;
  /** The RMA this credit settles, when opened from one. */
  rma: ReturnAuthorizationDetail | null;
  open: boolean;
  onClose: () => void;
  onIssued: () => Promise<void> | void;
}) {
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    initialRows(invoice, rma),
  );
  const [reason, setReason] = useState(
    rma ? `Returned under ${rma.number}: ${rma.reason}` : '',
  );
  const [creditDate, setCreditDate] = useState(todayLocal());
  /**
   * The last answer, with the request it answered. Shown only while it
   * answers what is entered now, so figures for an earlier entry are never
   * the ones confirmed.
   */
  const [answer, setAnswer] = useState<{
    request: string;
    preview: CreditPreview | null;
    refusal: string | null;
  } | null>(null);

  // Nothing credited yet: the only time "everything" is simply every line
  // at its full quantity and price, with no remainder to work out.
  const untouched = invoice.creditNotes.length === 0;

  const lines = invoice.lines
    .filter((line) => !isNothing(rows[line.id]?.quantity))
    .map((line) => {
      const row = rows[line.id];
      return {
        invoiceLineId: line.id,
        quantity: row.quantity.trim(),
        // Sent only when changed, so an untouched line is credited at the
        // invoice's own price by the server, not by a copy of it.
        ...(row.unitPrice.trim() !== line.unitPrice
          ? { unitPrice: row.unitPrice.trim() }
          : {}),
        ...(row.returnAuthorizationLineId
          ? { returnAuthorizationLineId: row.returnAuthorizationLineId }
          : {}),
      };
    });

  const request = JSON.stringify({ lines });
  const hasLines = lines.length > 0;

  /**
   * The server's figures for what is entered, a moment after typing stops.
   * Keyed on the request text, so the same entry is not asked for twice.
   */
  useEffect(() => {
    if (!open || !hasLines) return;

    let ignore = false;
    const timer = setTimeout(() => {
      void api<{ credit: CreditPreview }>(
        `/invoices/${invoice.id}/credit-notes/preview`,
        { method: 'POST', body: request },
      )
        .then((response) => {
          if (!ignore) {
            setAnswer({ request, preview: response.credit, refusal: null });
          }
        })
        .catch((caught: unknown) => {
          if (!ignore) {
            setAnswer({
              request,
              preview: null,
              refusal: messageFor(caught),
            });
          }
        });
    }, 400);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [open, invoice.id, request, hasLines]);

  const current = hasLines && answer?.request === request ? answer : null;
  const preview = current?.preview ?? null;
  const refusal = current?.refusal ?? null;

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onIssued();
    },
    { success: 'Credit note issued' },
  );

  function close() {
    reset();
    onClose();
  }

  function update(lineId: string, field: keyof Row, value: string) {
    setRows((current) => ({
      ...current,
      [lineId]: { ...current[lineId], [field]: value },
    }));
  }

  /** Every line in full, as a debt that will not be collected. */
  function creditEverything() {
    setRows(
      Object.fromEntries(
        invoice.lines.map((line) => [
          line.id,
          { quantity: line.quantity, unitPrice: line.unitPrice },
        ]),
      ),
    );
    setReason('Uncollectable');
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/invoices/${invoice.id}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify({ reason, creditDate, lines }),
      }),
    );
  }

  const showFigures = preview !== null;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          Credit {invoice.number}
          {rma ? ` for ${rma.number}` : ''}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Item</TableCell>
                    <TableCell align="right">Billed</TableCell>
                    <TableCell align="right">Credit quantity</TableCell>
                    <TableCell align="right">At unit price</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {invoice.lines.map((line) => {
                    const row = rows[line.id];
                    const rmaLine = rma?.lines.find(
                      (candidate) =>
                        candidate.orderLineId === line.orderLineId &&
                        candidate.resolution === 'credit',
                    );

                    return (
                      <TableRow key={line.id}>
                        <TableCell>
                          {line.sku}
                          <Typography variant="body2" color="text.secondary">
                            {line.description}
                          </Typography>
                          {rma && rmaLine && (
                            <Typography variant="body2" color="text.secondary">
                              {rma.number}: {rmaLine.quantity} authorized
                              {rma.expectsGoods
                                ? `, ${rmaLine.quantityReceived} back`
                                : ''}
                              , {rmaLine.quantityCredited} credited
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {line.quantity} at{' '}
                          {formatMoney(line.unitPrice, invoice.currency)}
                        </TableCell>
                        <TableCell align="right" sx={{ width: 140 }}>
                          <TextField
                            size="small"
                            value={row?.quantity ?? ''}
                            onChange={(event) =>
                              update(line.id, 'quantity', event.target.value)
                            }
                            slotProps={{
                              htmlInput: {
                                inputMode: 'decimal',
                                maxLength: 19,
                                'aria-label': `Credit quantity for ${line.sku}`,
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ width: 160 }}>
                          <TextField
                            size="small"
                            value={row?.unitPrice ?? line.unitPrice}
                            onChange={(event) =>
                              update(line.id, 'unitPrice', event.target.value)
                            }
                            slotProps={{
                              htmlInput: {
                                inputMode: 'decimal',
                                maxLength: 19,
                                'aria-label': `Credit price for ${line.sku}`,
                              },
                            }}
                          />
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>

            <Typography variant="body2" color="text.secondary">
              The price can be lowered — a restocking fee, goodwill, a price
              correction at the difference — but never raised.
            </Typography>

            {!rma && untouched && (
              <Button
                variant="text"
                onClick={creditEverything}
                sx={{ alignSelf: 'flex-start' }}
              >
                Credit everything — uncollectable
              </Button>
            )}

            {refusal && <Alert severity="warning">{refusal}</Alert>}

            {preview && (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                <Typography variant="body2">
                  Subtotal {formatMoney(preview.subtotal, invoice.currency)}
                </Typography>
                {preview.taxes.map((tax) => (
                  <Typography key={`${tax.name}-${tax.rate}`} variant="body2">
                    {tax.name} {formatRate(tax.rate)}{' '}
                    {formatMoney(tax.amount, invoice.currency)}
                  </Typography>
                ))}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  Total credited {formatMoney(preview.total, invoice.currency)}
                </Typography>
              </Stack>
            )}

            <TextField
              id="credit-reason"
              label="Reason"
              required
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText="Printed on the credit note, so the customer reads it."
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <TextField
              id="credit-date"
              label="Credit note date"
              type="date"
              required
              value={creditDate}
              onChange={(event) => setCreditDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ maxWidth: 240 }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !showFigures || !reason.trim()}
          >
            {submitting ? 'Issuing…' : 'Issue credit note'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}

/**
 * Every line at the invoice's price, empty — or, from an RMA, its credit
 * lines filled with what came back (what was authorized, if no goods were
 * expected), linked to the RMA line they settle. Filled only while nothing
 * on that RMA line is credited yet: otherwise the right figure is a
 * difference of decimals, and the person is shown both and chooses.
 */
function initialRows(
  invoice: InvoiceDetail,
  rma: ReturnAuthorizationDetail | null,
): Record<string, Row> {
  return Object.fromEntries(
    invoice.lines.map((line) => {
      const rmaLine = rma?.lines.find(
        (candidate) =>
          candidate.orderLineId === line.orderLineId &&
          candidate.resolution === 'credit',
      );

      if (!rma || !rmaLine) {
        return [line.id, { quantity: '', unitPrice: line.unitPrice }];
      }

      const available = rma.expectsGoods
        ? rmaLine.quantityReceived
        : rmaLine.quantity;

      return [
        line.id,
        {
          quantity:
            rmaLine.quantityCredited === NOTHING && available !== NOTHING
              ? available
              : '',
          unitPrice: line.unitPrice,
          returnAuthorizationLineId: rmaLine.id,
        },
      ];
    }),
  );
}
