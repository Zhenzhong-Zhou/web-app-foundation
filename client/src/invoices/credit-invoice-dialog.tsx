import {
  Alert,
  Button,
  Dialog,
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
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, messageFor } from '../lib/api';
import {
  formatMoney,
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
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
  return /^\s*0*([.,]0*)?\s*$/.test(quantity ?? '');
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
  const intl = useIntl();
  const [rows, setRows] = useState<Record<string, Row>>(() =>
    initialRows(invoice, rma),
  );
  // A suggestion in the reader's language; the reason is theirs to edit,
  // and is printed on the credit note as written.
  const [reason, setReason] = useState(
    rma
      ? intl.formatMessage(
          {
            id: 'invoices.credit.reasonFromRma',
            defaultMessage: 'Returned under {rma}: {reason}',
          },
          { rma: rma.number, reason: rma.reason },
        )
      : '',
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
      // In the API's form: the reader's decimal comma made a point, null
      // where a thousands separator was typed (ADR-054).
      const price = toApiDecimal(row.unitPrice);
      return {
        invoiceLineId: line.id,
        quantity: toApiDecimal(row.quantity),
        // Sent only when changed, so an untouched line is credited at the
        // invoice's own price by the server, not by a copy of it.
        ...(price !== line.unitPrice ? { unitPrice: price } : {}),
        ...(row.returnAuthorizationLineId
          ? { returnAuthorizationLineId: row.returnAuthorizationLineId }
          : {}),
      };
    });

  const grouped = lines.some(
    (line) =>
      line.quantity === null ||
      ('unitPrice' in line && line.unitPrice === null),
  );
  // Nothing sound to preview while a number holds a thousands separator.
  const request = grouped ? '' : JSON.stringify({ lines });
  const hasLines = lines.length > 0 && !grouped;

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
    {
      success: intl.formatMessage({
        id: 'invoices.credit.issued',
        defaultMessage: 'Credit note issued',
      }),
    },
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
          {
            quantity: formatQuantity(line.quantity),
            unitPrice: formatQuantity(line.unitPrice),
          },
        ]),
      ),
    );
    setReason(
      intl.formatMessage({
        id: 'invoices.credit.uncollectable',
        defaultMessage: 'Uncollectable',
      }),
    );
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Unreachable while grouped, since the button waits for figures; kept
    // so a submit never sends a number the API would misread.
    if (grouped) return;

    void submit(() =>
      api(`/invoices/${invoice.id}/credit-notes`, {
        method: 'POST',
        body: JSON.stringify({ reason, creditDate, lines }),
      }),
    );
  }

  const showFigures = preview !== null;

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {rma
            ? intl.formatMessage(
                {
                  id: 'invoices.credit.titleForRma',
                  defaultMessage: 'Credit {number} for {rma}',
                },
                { number: invoice.number, rma: rma.number },
              )
            : intl.formatMessage(
                {
                  id: 'invoices.credit.title',
                  defaultMessage: 'Credit {number}',
                },
                { number: invoice.number },
              )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {/* Said as soon as it is typed: the preview, and so the
                button, wait until the number reads one way only. */}
            {grouped ? (
              <FormError message={groupedNumberMessage()} />
            ) : (
              error && <FormError message={error} />
            )}

            <TableContainer>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'inventory.item',
                        defaultMessage: 'Item',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'invoices.credit.billed',
                        defaultMessage: 'Billed',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'invoices.credit.quantity',
                        defaultMessage: 'Credit quantity',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'invoices.credit.atPrice',
                        defaultMessage: 'At unit price',
                      })}
                    </TableCell>
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
                              {rma.expectsGoods
                                ? intl.formatMessage(
                                    {
                                      id: 'invoices.credit.rmaLineGoods',
                                      defaultMessage:
                                        '{rma}: {authorized} authorized, {back} back, {credited} credited',
                                    },
                                    {
                                      rma: rma.number,
                                      authorized: formatQuantity(
                                        rmaLine.quantity,
                                      ),
                                      back: formatQuantity(
                                        rmaLine.quantityReceived,
                                      ),
                                      credited: formatQuantity(
                                        rmaLine.quantityCredited,
                                      ),
                                    },
                                  )
                                : intl.formatMessage(
                                    {
                                      id: 'invoices.credit.rmaLine',
                                      defaultMessage:
                                        '{rma}: {authorized} authorized, {credited} credited',
                                    },
                                    {
                                      rma: rma.number,
                                      authorized: formatQuantity(
                                        rmaLine.quantity,
                                      ),
                                      credited: formatQuantity(
                                        rmaLine.quantityCredited,
                                      ),
                                    },
                                  )}
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {intl.formatMessage(
                            {
                              id: 'invoices.credit.billedAt',
                              defaultMessage: '{quantity} at {price}',
                            },
                            {
                              quantity: formatQuantity(line.quantity),
                              price: formatMoney(
                                line.unitPrice,
                                invoice.currency,
                              ),
                            },
                          )}
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
                                'aria-label': intl.formatMessage(
                                  {
                                    id: 'invoices.credit.quantityFor',
                                    defaultMessage: 'Credit quantity for {sku}',
                                  },
                                  { sku: line.sku },
                                ),
                              },
                            }}
                          />
                        </TableCell>
                        <TableCell align="right" sx={{ width: 160 }}>
                          <TextField
                            size="small"
                            value={
                              row?.unitPrice ?? formatQuantity(line.unitPrice)
                            }
                            onChange={(event) =>
                              update(line.id, 'unitPrice', event.target.value)
                            }
                            slotProps={{
                              htmlInput: {
                                inputMode: 'decimal',
                                maxLength: 19,
                                'aria-label': intl.formatMessage(
                                  {
                                    id: 'invoices.credit.priceFor',
                                    defaultMessage: 'Credit price for {sku}',
                                  },
                                  { sku: line.sku },
                                ),
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
              {intl.formatMessage({
                id: 'invoices.credit.priceRule',
                defaultMessage:
                  'The price can be lowered — a restocking fee, goodwill, a price correction at the difference — but never raised.',
              })}
            </Typography>

            {!rma && untouched && (
              <Button
                variant="text"
                onClick={creditEverything}
                sx={{ alignSelf: 'flex-start' }}
              >
                {intl.formatMessage({
                  id: 'invoices.credit.everything',
                  defaultMessage: 'Credit everything — uncollectable',
                })}
              </Button>
            )}

            {refusal && <Alert severity="warning">{refusal}</Alert>}

            {preview && (
              <Stack spacing={0.5} sx={{ alignItems: 'flex-end' }}>
                <Typography variant="body2">
                  {intl.formatMessage(
                    {
                      id: 'invoices.credit.subtotal',
                      defaultMessage: 'Subtotal {amount}',
                    },
                    { amount: formatMoney(preview.subtotal, invoice.currency) },
                  )}
                </Typography>
                {preview.taxes.map((tax) => (
                  <Typography key={`${tax.name}-${tax.rate}`} variant="body2">
                    {[
                      tax.name,
                      formatRate(tax.rate),
                      formatMoney(tax.amount, invoice.currency),
                    ].join(' ')}
                  </Typography>
                ))}
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                  {intl.formatMessage(
                    {
                      id: 'invoices.credit.total',
                      defaultMessage: 'Total credited {amount}',
                    },
                    { amount: formatMoney(preview.total, invoice.currency) },
                  )}
                </Typography>
              </Stack>
            )}

            <TextField
              id="credit-reason"
              label={intl.formatMessage({
                id: 'invoices.void.reason',
                defaultMessage: 'Reason',
              })}
              required
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={intl.formatMessage({
                id: 'invoices.void.reason.help',
                defaultMessage:
                  'Printed on the credit note, so the customer reads it.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

            <TextField
              id="credit-date"
              label={intl.formatMessage({
                id: 'invoices.creditDate',
                defaultMessage: 'Credit note date',
              })}
              type="date"
              required
              value={creditDate}
              onChange={(event) => setCreditDate(event.target.value)}
              slotProps={{ inputLabel: { shrink: true } }}
              sx={{ maxWidth: 240 }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'invoices.credit.action',
            defaultMessage: 'Issue credit note',
          })}
          pendingLabel={intl.formatMessage({
            id: 'invoices.issue.pending',
            defaultMessage: 'Issuing…',
          })}
          disabled={!showFigures || !reason.trim()}
        />
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

      // Numbers shown the reader's way, and read back the same (ADR-054).
      if (!rma || !rmaLine) {
        return [
          line.id,
          { quantity: '', unitPrice: formatQuantity(line.unitPrice) },
        ];
      }

      const available = rma.expectsGoods
        ? rmaLine.quantityReceived
        : rmaLine.quantity;

      return [
        line.id,
        {
          quantity:
            rmaLine.quantityCredited === NOTHING && available !== NOTHING
              ? formatQuantity(available)
              : '',
          unitPrice: formatQuantity(line.unitPrice),
          returnAuthorizationLineId: rmaLine.id,
        },
      ];
    }),
  );
}
