import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
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
import { type SubmitEvent, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api, ApiError } from '../lib/api';
import {
  formatDay,
  formatQuantity,
  groupedNumberMessage,
  NO_VALUE,
  toApiDecimal,
} from '../lib/format';
import type {
  Location,
  ReturnableLine,
  ReturnAuthorizationDetail,
  ReturnAuthorizationLine,
  ReturnAuthorizationPage,
  ReturnAuthorizationSummary,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { unitLabel } from '../products/units';
import { RETURN_REASONS, returnReasonLabel } from './return-reasons';

/**
 * A quantity of nothing, recognised as text rather than parsed: "", "0",
 * "0.00". Quantities stay strings end to end (ADR-025).
 */
function isNothing(quantity: string | undefined): boolean {
  return /^\s*0*([.,]0*)?\s*$/.test(quantity ?? '');
}

/** A tracked line sends its lots, an untracked one a quantity (ADR-043). */
/** Null where a quantity was typed with a thousands separator (ADR-054). */
type ReturnLinePayload =
  | { lineId: string; lots: { lotId: string; quantity: string | null }[] }
  | { lineId: string; quantity: string | null };

/**
 * Takes a customer return against a sales order (ADR-043).
 *
 * Built from what the server says can still come back, so it offers exactly
 * what it will accept: each line that shipped, and for tracked stock each
 * lot that shipped on this order, with how much of it has already returned.
 * A lot that never went to this customer is not offered, because it cannot
 * come back from them.
 *
 * Tracked lines are entered per lot and untracked lines as a quantity. The
 * dialog never adds lots up — the server sums them in SQL.
 *
 * A return may be received against an open RMA that expects goods
 * (ADR-047). Each line then shows what that RMA authorized and what has
 * already come back against it, and the server holds the return to it. No
 * RMA is the default: goods on the dock are recorded either way, and one
 * that arrived unannounced can be linked to an RMA afterwards.
 */
export function ReturnOrderDialog({
  open,
  orderId,
  locations,
  canSeeRmas,
  onClose,
  onReturned,
}: {
  open: boolean;
  orderId: string;
  /** All leaves, unavailable ones included: that is where returns belong. */
  locations: Location[];
  /** return_authorizations.view: whether to offer the RMA picker at all. */
  canSeeRmas: boolean;
  onClose: () => void;
  onReturned: () => Promise<void> | void;
}) {
  const intl = useIntl();
  const [numberError, setNumberError] = useState<string | null>(null);
  const [lines, setLines] = useState<ReturnableLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  /** Open RMAs on this order that expect goods: the ones a box can meet. */
  const [rmas, setRmas] = useState<ReturnAuthorizationSummary[]>([]);
  const [rmaId, setRmaId] = useState('');

  /**
   * The lines of the RMA last loaded, keyed by its id, so a change of RMA
   * shows nothing until its own lines arrive — derived below rather than
   * cleared in an effect.
   */
  const [loaded, setLoaded] = useState<{
    id: string;
    lines: ReturnAuthorizationLine[];
  } | null>(null);

  const [toLocationId, setTo] = useState('');
  const [reason, setReason] = useState('damaged');
  const [note, setNote] = useState('');

  /** Untracked lines: one quantity each, keyed by line. */
  const [quantities, setQuantities] = useState<Record<string, string>>({});

  /** Tracked lines: a quantity per lot, keyed by line then lot. */
  const [byLot, setByLot] = useState<Record<string, Record<string, string>>>(
    {},
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onReturned();
    },
    {
      success: intl.formatMessage({
        id: 'orders.return.done',
        defaultMessage: 'Return received',
      }),
    },
  );

  useEffect(() => {
    if (!open) return;

    let ignore = false;

    void api<ReturnableLine[]>(`/orders/${orderId}/returns/returnable`)
      .then((rows) => {
        if (!ignore) setLines(rows);
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setLoadError(
            caught instanceof ApiError
              ? caught.message
              : intl.formatMessage({
                  id: 'orders.return.loadFailed',
                  defaultMessage: 'Could not load what shipped.',
                }),
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [open, orderId, intl]);

  useEffect(() => {
    if (!open || !canSeeRmas) return;

    let ignore = false;

    void api<ReturnAuthorizationPage>(
      `/return-authorizations?orderId=${orderId}&status=open&limit=100`,
    )
      .then((page) => {
        if (!ignore) {
          setRmas(page.entries.filter((rma) => rma.expectsGoods));
        }
      })
      .catch(() => {
        // The picker stays empty; a return needs no RMA.
      });

    return () => {
      ignore = true;
    };
  }, [open, orderId, canSeeRmas]);

  /** The chosen RMA's lines, so each item can say what it allows. */
  useEffect(() => {
    if (!rmaId) return;

    let ignore = false;

    void api<{ returnAuthorization: ReturnAuthorizationDetail }>(
      `/return-authorizations/${rmaId}`,
    )
      .then((response) => {
        if (!ignore) {
          setLoaded({ id: rmaId, lines: response.returnAuthorization.lines });
        }
      })
      .catch(() => {
        // Without its lines the dialog simply says nothing per item; the
        // server still holds the return to the RMA.
      });

    return () => {
      ignore = true;
    };
  }, [rmaId]);

  const chosenRma = rmas.find((rma) => rma.id === rmaId);
  const rmaLines = rmaId && loaded?.id === rmaId ? loaded.lines : null;

  function close() {
    setNumberError(null);
    reset();
    onClose();
  }

  /** What would be sent: only lines with something coming back. */
  function payloadLines(): ReturnLinePayload[] {
    return (lines ?? []).flatMap((line): ReturnLinePayload[] => {
      if (line.tracksLots) {
        const lots = Object.entries(byLot[line.lineId] ?? {})
          .filter(([, quantity]) => !isNothing(quantity))
          .map(([lotId, quantity]) => ({
            lotId,
            quantity: toApiDecimal(quantity),
          }));

        return lots.length > 0 ? [{ lineId: line.lineId, lots }] : [];
      }

      const quantity = quantities[line.lineId];
      return isNothing(quantity)
        ? []
        : [{ lineId: line.lineId, quantity: toApiDecimal(quantity!) }];
    });
  }

  const sending = payloadLines();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // A thousands separator anywhere is refused rather than guessed.
    const grouped = sending.some((line) =>
      'lots' in line
        ? line.lots.some((lot) => lot.quantity === null)
        : line.quantity === null,
    );
    if (grouped) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(() =>
      api(`/orders/${orderId}/returns`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId,
          returnAuthorizationId: rmaId || undefined,
          reason,
          note: note.trim() || undefined,
          lines: sending,
        }),
      }),
    );
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
            id: 'orders.lines.takeReturn',
            defaultMessage: 'Take a return',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}
            {loadError && <Alert severity="error">{loadError}</Alert>}

            <Stack direction="row" spacing={2}>
              <TextField
                id="return-to"
                label={intl.formatMessage({
                  id: 'orders.return.putIn',
                  defaultMessage: 'Put it in',
                })}
                select
                required
                fullWidth
                value={toLocationId}
                onChange={(event) => setTo(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'orders.return.putIn.help',
                  defaultMessage:
                    'Usually a bin marked not available, so nothing ships it again before it is checked.',
                })}
              >
                {locations.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.isAvailable
                      ? location.name
                      : intl.formatMessage(
                          {
                            id: 'orders.return.notAvailable',
                            defaultMessage: '{name} (not available)',
                          },
                          { name: location.name },
                        )}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                id="return-reason"
                label={intl.formatMessage({
                  id: 'inventory.why',
                  defaultMessage: 'Why',
                })}
                select
                fullWidth
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {RETURN_REASONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {returnReasonLabel(option, intl)}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {rmas.length > 0 && (
              <TextField
                id="return-rma"
                label={intl.formatMessage({
                  id: 'orders.return.againstRma',
                  defaultMessage: 'Against RMA',
                })}
                select
                fullWidth
                value={rmaId}
                onChange={(event) => setRmaId(event.target.value)}
                helperText={intl.formatMessage({
                  id: 'orders.return.againstRma.help',
                  defaultMessage:
                    'If the customer was authorized to send this back. It is then held to what the RMA allows.',
                })}
              >
                <MenuItem value="">
                  <em>
                    {intl.formatMessage({
                      id: 'orders.return.noRma',
                      defaultMessage: 'None',
                    })}
                  </em>
                </MenuItem>
                {rmas.map((rma) => (
                  <MenuItem key={rma.id} value={rma.id}>
                    {[rma.number, rma.reason].join(' — ')}
                  </MenuItem>
                ))}
              </TextField>
            )}

            {lines?.map((line) => {
              const authorized = rmaLines?.find(
                (rmaLine) => rmaLine.orderLineId === line.lineId,
              );

              return (
                <Stack key={line.lineId} spacing={1}>
                  <Typography>
                    {line.sku}
                    <Typography
                      component="span"
                      variant="body2"
                      color="text.secondary"
                      sx={{ ml: 0.5 }}
                    >
                      {intl.formatMessage(
                        {
                          id: 'orders.return.lineSummary',
                          defaultMessage:
                            '— {shipped} shipped, {returned} already back',
                        },
                        {
                          shipped: formatQuantity(line.quantityFulfilled),
                          returned: formatQuantity(line.quantityReturned),
                        },
                      )}
                    </Typography>
                  </Typography>

                  {/* What the chosen RMA allows, as figures from the server;
                    the dialog does not subtract them (ADR-025). */}
                  {chosenRma &&
                    rmaLines &&
                    (authorized ? (
                      <Typography variant="body2" color="text.secondary">
                        {intl.formatMessage(
                          {
                            id: 'orders.return.rmaAllows',
                            defaultMessage:
                              '{rma} authorizes {quantity}, {received} back against it so far',
                          },
                          {
                            rma: chosenRma.number,
                            quantity: formatQuantity(authorized.quantity),
                            received: formatQuantity(
                              authorized.quantityReceived,
                            ),
                          },
                        )}
                      </Typography>
                    ) : (
                      <Typography variant="body2" color="warning.main">
                        {intl.formatMessage(
                          {
                            id: 'orders.return.notOnRma',
                            defaultMessage:
                              'Not on {rma} — leave it empty, or receive it without the RMA',
                          },
                          { rma: chosenRma.number },
                        )}
                      </Typography>
                    ))}

                  {line.tracksLots ? (
                    <TableContainer>
                      <Table size="small">
                        <TableHead>
                          <TableRow>
                            <TableCell>
                              {intl.formatMessage({
                                id: 'inventory.lot',
                                defaultMessage: 'Lot',
                              })}
                            </TableCell>
                            <TableCell>
                              {intl.formatMessage({
                                id: 'inventory.lot.expires',
                                defaultMessage: 'Expires',
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
                                id: 'orders.return.comingBack',
                                defaultMessage: 'Coming back',
                              })}
                            </TableCell>
                          </TableRow>
                        </TableHead>
                        <TableBody>
                          {line.lots.map((lot) => (
                            <TableRow key={lot.lotId}>
                              <TableCell>{lot.code}</TableCell>
                              <TableCell>
                                {lot.expiresAt
                                  ? formatDay(lot.expiresAt)
                                  : NO_VALUE}
                              </TableCell>
                              <TableCell align="right">
                                {formatQuantity(lot.shipped)}
                              </TableCell>
                              <TableCell align="right">
                                {formatQuantity(lot.returned)}
                              </TableCell>
                              <TableCell align="right" sx={{ width: 140 }}>
                                <TextField
                                  size="small"
                                  value={byLot[line.lineId]?.[lot.lotId] ?? ''}
                                  onChange={(event) =>
                                    setByLot((current) => ({
                                      ...current,
                                      [line.lineId]: {
                                        ...current[line.lineId],
                                        [lot.lotId]: event.target.value,
                                      },
                                    }))
                                  }
                                  slotProps={{
                                    htmlInput: {
                                      inputMode: 'decimal',
                                      maxLength: 19,
                                      'aria-label': intl.formatMessage(
                                        {
                                          id: 'orders.return.fromLot',
                                          defaultMessage:
                                            'Return from lot {code}',
                                        },
                                        { code: lot.code },
                                      ),
                                    },
                                  }}
                                />
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </TableContainer>
                  ) : (
                    <TextField
                      size="small"
                      label={intl.formatMessage({
                        id: 'orders.return.comingBack',
                        defaultMessage: 'Coming back',
                      })}
                      value={quantities[line.lineId] ?? ''}
                      onChange={(event) =>
                        setQuantities((current) => ({
                          ...current,
                          [line.lineId]: event.target.value,
                        }))
                      }
                      slotProps={{
                        htmlInput: {
                          inputMode: 'decimal',
                          maxLength: 19,
                          'aria-label': intl.formatMessage(
                            {
                              id: 'orders.return.lineLabel',
                              defaultMessage: 'Return {sku}',
                            },
                            { sku: line.sku },
                          ),
                        },
                      }}
                      helperText={unitLabel(line.unitOfMeasure, intl)}
                      sx={{ width: 180 }}
                    />
                  )}
                </Stack>
              );
            })}

            {lines?.length === 0 && (
              <Typography color="text.secondary">
                {intl.formatMessage({
                  id: 'orders.return.nothingShipped',
                  defaultMessage:
                    'Nothing has shipped on this order, so nothing can come back.',
                })}
              </Typography>
            )}

            <TextField
              id="return-note"
              label={intl.formatMessage({
                id: 'inventory.note',
                defaultMessage: 'Note',
              })}
              fullWidth
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              helperText={intl.formatMessage({
                id: 'orders.return.note.help',
                defaultMessage:
                  'What the customer said, or what you found in the box.',
              })}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'orders.return.notRestocked',
                defaultMessage:
                  'Nothing is restocked here. Once checked, move it to a shelf, or correct the count if it is being written off.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.return.action',
            defaultMessage: 'Receive return',
          })}
          pendingLabel={intl.formatMessage({
            id: 'inventory.receive.pending',
            defaultMessage: 'Receiving…',
          })}
          disabled={!toLocationId || sending.length === 0}
        />
      </form>
    </Dialog>
  );
}
