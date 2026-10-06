import {
  Alert,
  Checkbox,
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
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
import { type SubmitEvent, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
import type {
  InvoicePage,
  InvoiceSummary,
  OrderLine,
  ReturnResolution,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { resolutionLabel, RESOLUTIONS } from './rma-labels';

/**
 * A quantity of nothing, recognised as text rather than parsed (ADR-025):
 * "0.00", or "0,00" as French writes it.
 */
function isNothing(quantity: string | undefined): boolean {
  return /^\s*0*([.,]0*)?\s*$/.test(quantity ?? '');
}

/**
 * Raises an RMA against a sale (ADR-047): what the customer may send back,
 * and what happens to each item.
 *
 * Authorized when raised — the person filling this in is the person
 * deciding. Each line shows what shipped and what already came back; the
 * server refuses more than the customer holds, so the dialog does not
 * subtract decimals itself. A sample offers no credit, since nothing on it
 * was billed. On success it opens the new RMA.
 */
export function RaiseRmaDialog({
  open,
  orderId,
  isSample,
  lines,
  canViewInvoices,
  onClose,
}: {
  open: boolean;
  orderId: string;
  isSample: boolean;
  /** The order's lines; only those that shipped are offered. */
  lines: OrderLine[];
  canViewInvoices: boolean;
  onClose: () => void;
}) {
  const intl = useIntl();
  const navigate = useNavigate();
  // Set when a quantity is typed with a thousands separator (ADR-054).
  const [numberError, setNumberError] = useState<string | null>(null);
  const shipped = lines.filter((line) => line.quantityFulfilled !== '0.0000');

  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [expectsGoods, setExpectsGoods] = useState(true);
  const [invoiceId, setInvoiceId] = useState('');
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [resolutions, setResolutions] = useState<
    Record<string, ReturnResolution>
  >({});

  const defaultResolution: ReturnResolution = isSample ? 'replace' : 'credit';

  // useSubmit's callback takes no result, so the new id is kept here.
  const createdId = useRef<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    () => {
      close();
      navigate(`/return-authorizations/${createdId.current}`);
    },
    {
      success: intl.formatMessage({
        id: 'rmas.authorized',
        defaultMessage: 'Return authorized',
      }),
    },
  );

  /**
   * The order's issued invoices, for the one the customer quoted. Only
   * issued ones: a draft owes nothing and a voided one was credited in full,
   * so neither could be credited against.
   */
  useEffect(() => {
    if (!open || !canViewInvoices || isSample) return;

    let ignore = false;

    void api<InvoicePage>(
      `/invoices?orderId=${orderId}&status=issued&limit=100`,
    )
      .then((page) => {
        if (!ignore) setInvoices(page.entries);
      })
      .catch(() => {
        // The picker stays empty; an RMA needs no invoice.
      });

    return () => {
      ignore = true;
    };
  }, [open, orderId, canViewInvoices, isSample]);

  function close() {
    setNumberError(null);
    reset();
    onClose();
  }

  const sending = shipped
    .filter((line) => !isNothing(quantities[line.id]))
    .map((line) => ({
      lineId: line.id,
      // In the API's form; null where a thousands separator was typed.
      quantity: toApiDecimal(quantities[line.id]),
      resolution: resolutions[line.id] ?? defaultResolution,
    }));

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    if (sending.some((line) => line.quantity === null)) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(async () => {
      const { returnAuthorization } = await api<{
        returnAuthorization: { id: string };
      }>('/return-authorizations', {
        method: 'POST',
        body: JSON.stringify({
          orderId,
          reason,
          expectsGoods,
          invoiceId: invoiceId || undefined,
          note: note.trim() || undefined,
          lines: sending,
        }),
      });
      createdId.current = returnAuthorization.id;
    });
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="md"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'rmas.raise.title',
            defaultMessage: 'Authorize a return',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}

            <TextField
              id="rma-reason"
              label={intl.formatMessage({
                id: 'rmas.raise.why',
                defaultMessage: 'Why is it coming back',
              })}
              required
              fullWidth
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              helperText={intl.formatMessage({
                id: 'rmas.raise.why.help',
                defaultMessage:
                  'What the customer said: cracked in transit, wrong item, expired on arrival.',
              })}
              slotProps={{ htmlInput: { maxLength: 500 } }}
            />

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
                        id: 'inventory.trace.shipped',
                        defaultMessage: 'Shipped',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'orders.return.alreadyBack',
                        defaultMessage: 'Already back',
                      })}
                    </TableCell>
                    <TableCell align="right">
                      {intl.formatMessage({
                        id: 'rmas.raise.mayComeBack',
                        defaultMessage: 'May come back',
                      })}
                    </TableCell>
                    <TableCell>
                      {intl.formatMessage({
                        id: 'rmas.then',
                        defaultMessage: 'Then',
                      })}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {shipped.map((line) => (
                    <TableRow key={line.id}>
                      <TableCell>
                        {line.sku}
                        <Typography variant="body2" color="text.secondary">
                          {line.description}
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(line.quantityFulfilled)}
                      </TableCell>
                      <TableCell align="right">
                        {formatQuantity(line.quantityReturned)}
                      </TableCell>
                      <TableCell align="right" sx={{ width: 140 }}>
                        <TextField
                          size="small"
                          value={quantities[line.id] ?? ''}
                          onChange={(event) =>
                            setQuantities((current) => ({
                              ...current,
                              [line.id]: event.target.value,
                            }))
                          }
                          slotProps={{
                            htmlInput: {
                              inputMode: 'decimal',
                              maxLength: 19,
                              'aria-label': intl.formatMessage(
                                {
                                  id: 'rmas.raise.authorizeLine',
                                  defaultMessage: 'Authorize {sku}',
                                },
                                { sku: line.sku },
                              ),
                            },
                          }}
                        />
                      </TableCell>
                      <TableCell sx={{ width: 220 }}>
                        <TextField
                          select
                          size="small"
                          fullWidth
                          value={resolutions[line.id] ?? defaultResolution}
                          onChange={(event) =>
                            setResolutions((current) => ({
                              ...current,
                              [line.id]: event.target.value as ReturnResolution,
                            }))
                          }
                          slotProps={{
                            htmlInput: {
                              'aria-label': intl.formatMessage(
                                {
                                  id: 'rmas.raise.thenFor',
                                  defaultMessage: 'Then for {sku}',
                                },
                                { sku: line.sku },
                              ),
                            },
                          }}
                        >
                          {RESOLUTIONS
                            // Nothing on a sample was billed (ADR-042).
                            .filter(
                              (value) => !(isSample && value === 'credit'),
                            )
                            .map((value) => (
                              <MenuItem key={value} value={value}>
                                {resolutionLabel(value)}
                              </MenuItem>
                            ))}
                        </TextField>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </TableContainer>

            {shipped.length === 0 && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'orders.return.nothingShipped',
                  defaultMessage:
                    'Nothing has shipped on this order, so nothing can come back.',
                })}
              </Alert>
            )}

            <FormControlLabel
              control={
                <Checkbox
                  checked={expectsGoods}
                  onChange={(event) => setExpectsGoods(event.target.checked)}
                />
              }
              label={intl.formatMessage({
                id: 'rmas.raise.expectsGoods',
                defaultMessage: 'The customer is sending the goods back',
              })}
            />
            {!expectsGoods && (
              <Typography variant="body2" color="text.secondary">
                {intl.formatMessage({
                  id: 'rmas.raise.keepOrDestroy',
                  defaultMessage:
                    'Told to keep or destroy them: credit then follows what is authorized here, since no box will arrive to be received.',
                })}
              </Typography>
            )}

            {!isSample && canViewInvoices && (
              <TextField
                id="rma-invoice"
                select
                label={intl.formatMessage({
                  id: 'rmas.raise.invoice',
                  defaultMessage: 'Invoice the customer quoted',
                })}
                fullWidth
                value={invoiceId}
                onChange={(event) => setInvoiceId(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'rmas.raise.invoice.help',
                  defaultMessage: 'Optional. The credit defaults to it.',
                })}
              >
                <MenuItem value="">
                  <em>
                    {intl.formatMessage({
                      id: 'rmas.raise.noInvoice',
                      defaultMessage: 'None quoted',
                    })}
                  </em>
                </MenuItem>
                {invoices.map((invoice) => (
                  <MenuItem key={invoice.id} value={invoice.id}>
                    {invoice.number}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="rma-note"
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              fullWidth
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'rmas.raise.action',
            defaultMessage: 'Authorize',
          })}
          pendingLabel={intl.formatMessage({
            id: 'rmas.raise.pending',
            defaultMessage: 'Authorizing…',
          })}
          disabled={sending.length === 0 || !reason.trim()}
        />
      </form>
    </Dialog>
  );
}
