import {
  Alert,
  Button,
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
  SEPARATOR,
  toApiDecimal,
} from '../lib/format';
import type {
  Location,
  OrderDetail,
  OrderLine,
  ShipmentPlanLine,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * A quantity of nothing, recognised as text rather than parsed: "", "0",
 * "0.00", or "0,00" as French writes it. Quantities stay strings end to end
 * (ADR-025), so zero is a shape, not a number compared against 0.
 */
function isNothing(quantity: string): boolean {
  return /^\s*0*([.,]0*)?\s*$/.test(quantity);
}

/**
 * Ships a sales order, or part of it, as one shipment (ADR-041).
 *
 * Every line still outstanding is listed, prefilled with what is outstanding.
 * Clearing a quantity, or setting it to 0, leaves that line for a later
 * shipment — partial is the normal case. What does go leaves together or not
 * at all: the server refuses the whole shipment if any line cannot be
 * covered, rather than recording half a box as sent.
 *
 * Lots are previewed per line, earliest expiry first and oldest first where
 * nothing expires, and can be replaced for a line with Choose lots. The
 * preview is advice: the server allocates again at ship time against the
 * shelf as it is then.
 */
export function ShipOrderDialog({
  open,
  order,
  locations,
  onClose,
  onShipped,
}: {
  open: boolean;
  order: OrderDetail;
  /** Leaves only: stock sits nowhere else (ADR-024). */
  locations: Location[];
  onClose: () => void;
  onShipped: () => Promise<void> | void;
}) {
  const intl = useIntl();
  // Set when a quantity is typed with a thousands separator (ADR-054).
  const [numberError, setNumberError] = useState<string | null>(null);
  const outstanding = order.lines.filter(
    (line) => !line.isComplete && !line.isClosedShort,
  );

  const [fromLocationId, setFrom] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      // Shown the reader's way, 6,0000 in French, and read back the same.
      outstanding.map((line) => [
        line.id,
        formatQuantity(line.quantityOutstanding),
      ]),
    ),
  );

  const [plan, setPlan] = useState<ShipmentPlanLine[] | null>(null);
  const [planError, setPlanError] = useState<string | null>(null);

  /** Hand-picked quantities per line, keyed by lot id. */
  const [picks, setPicks] = useState<Record<string, Record<string, string>>>(
    {},
  );

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onShipped();
    },
    {
      success: intl.formatMessage({
        id: 'orders.status.shipped',
        defaultMessage: 'Shipped',
      }),
    },
  );

  const sending = outstanding.filter(
    (line) => !isNothing(quantities[line.id] ?? ''),
  );

  /**
   * What the preview is asked about, as one string, so the effect reruns
   * when a quantity changes and not on every render.
   */
  // What the preview asks about, in the API's form. Empty while a quantity
  // holds a thousands separator: there is nothing sound to preview.
  const asSent = sending.map(
    (line) => [line.id, toApiDecimal(quantities[line.id])] as const,
  );
  const request = asSent.some(([, quantity]) => quantity === null)
    ? ''
    : JSON.stringify(asSent);

  // Previewed after a short pause, so typing "120" asks once, not three
  // times. State is only ever set in the callback, never in the effect body.
  useEffect(() => {
    if (!open || !fromLocationId || sending.length === 0 || !request) return;

    let ignore = false;

    const timer = setTimeout(() => {
      void api<{ lines: ShipmentPlanLine[] }>(
        `/orders/${order.id}/shipments/preview`,
        {
          method: 'POST',
          body: JSON.stringify({
            fromLocationId,
            lines: (JSON.parse(request) as [string, string][]).map(
              ([lineId, quantity]) => ({ lineId, quantity }),
            ),
          }),
        },
      )
        .then((result) => {
          if (!ignore) {
            setPlan(result.lines);
            setPlanError(null);
          }
        })
        .catch((caught: unknown) => {
          if (!ignore) {
            setPlanError(
              caught instanceof ApiError
                ? caught.message
                : intl.formatMessage({
                    id: 'orders.ship.checkFailed',
                    defaultMessage: 'Could not check stock.',
                  }),
            );
          }
        });
    }, 300);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
    // `sending.length` is read for the guard; `request` carries its content.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fromLocationId, request, order.id]);

  function close() {
    setNumberError(null);
    reset();
    onClose();
  }

  function planFor(line: OrderLine): ShipmentPlanLine | undefined {
    return plan?.find((entry) => entry.lineId === line.id);
  }

  function setQuantity(lineId: string, value: string) {
    setQuantities((current) => ({ ...current, [lineId]: value }));

    // A pick was for the old quantity and would no longer add up.
    setPicks((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }

  function startPicking(entry: ShipmentPlanLine) {
    setPicks((current) => ({
      ...current,
      [entry.lineId]: Object.fromEntries(
        entry.lots.map((lot) => [
          lot.lotId,
          lot.taken ? formatQuantity(lot.take) : '',
        ]),
      ),
    }));
  }

  function stopPicking(lineId: string) {
    setPicks((current) => {
      const next = { ...current };
      delete next[lineId];
      return next;
    });
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // Every number in the API's form: the language's decimal comma made a
    // point, a thousands separator refused rather than guessed (ADR-054).
    const lines = sending.map((line) => {
      const byLot = picks[line.id];
      const lots = byLot
        ? Object.entries(byLot)
            .filter(([, quantity]) => !isNothing(quantity))
            .map(([lotId, quantity]) => ({
              lotId,
              quantity: toApiDecimal(quantity),
            }))
        : [];

      return {
        lineId: line.id,
        quantity: toApiDecimal(quantities[line.id]),
        lots,
      };
    });

    if (
      lines.some(
        (line) =>
          line.quantity === null ||
          line.lots.some((lot) => lot.quantity === null),
      )
    ) {
      setNumberError(groupedNumberMessage());
      return;
    }
    setNumberError(null);

    void submit(() =>
      api(`/orders/${order.id}/shipments`, {
        method: 'POST',
        body: JSON.stringify({
          fromLocationId,
          carrier: carrier.trim() || undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          note: note.trim() || undefined,
          lines: lines.map((line) => ({
            lineId: line.lineId,
            quantity: line.quantity,
            lots: line.lots.length > 0 ? line.lots : undefined,
          })),
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
            id: 'orders.lines.ship',
            defaultMessage: 'Ship',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {(numberError ?? error) && (
              <FormError message={(numberError ?? error)!} />
            )}

            <TextField
              id="ship-from"
              label={intl.formatMessage({
                id: 'orders.ship.from',
                defaultMessage: 'Ship from',
              })}
              select
              required
              fullWidth
              value={fromLocationId}
              onChange={(event) => {
                // A different shelf is a different plan.
                setPlan(null);
                setPlanError(null);
                setPicks({});
                setFrom(event.target.value);
              }}
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.name}
                </MenuItem>
              ))}
            </TextField>

            {planError && <Alert severity="error">{planError}</Alert>}

            {outstanding.map((line) => {
              const entry = planFor(line);
              const picking = picks[line.id];

              return (
                <Stack key={line.id} spacing={1}>
                  <Stack
                    direction="row"
                    spacing={2}
                    sx={{ alignItems: 'center' }}
                  >
                    <Typography sx={{ flexGrow: 1 }}>
                      {line.sku}
                      <Typography
                        component="span"
                        variant="body2"
                        color="text.secondary"
                        sx={{ ml: 0.5 }}
                      >
                        {intl.formatMessage(
                          {
                            id: 'orders.ship.outstanding',
                            defaultMessage: '— {quantity} outstanding',
                          },
                          {
                            quantity: formatQuantity(line.quantityOutstanding),
                          },
                        )}
                      </Typography>
                    </Typography>

                    <TextField
                      size="small"
                      label={intl.formatMessage({
                        id: 'orders.lines.ship',
                        defaultMessage: 'Ship',
                      })}
                      value={quantities[line.id] ?? ''}
                      onChange={(event) =>
                        setQuantity(line.id, event.target.value)
                      }
                      slotProps={{
                        htmlInput: {
                          inputMode: 'decimal',
                          maxLength: 19,
                          'aria-label': intl.formatMessage(
                            {
                              id: 'orders.ship.lineLabel',
                              defaultMessage: 'Ship {sku}',
                            },
                            { sku: line.sku },
                          ),
                        },
                      }}
                      sx={{ width: 140 }}
                    />
                  </Stack>

                  {entry?.exceedsOutstanding && (
                    <Alert severity="warning">
                      {intl.formatMessage(
                        {
                          id: 'orders.ship.tooMany',
                          defaultMessage:
                            'More than the {quantity} still outstanding. The server will refuse it.',
                        },
                        { quantity: formatQuantity(line.quantityOutstanding) },
                      )}
                    </Alert>
                  )}

                  {entry?.shortBy && (
                    <Alert severity="warning">
                      {intl.formatMessage(
                        {
                          id: 'orders.ship.short',
                          defaultMessage:
                            'This location is {quantity} short of {sku}.',
                        },
                        {
                          quantity: formatQuantity(entry.shortBy),
                          sku: line.sku,
                        },
                      )}
                    </Alert>
                  )}

                  {entry?.tracksLots && !picking && (
                    <Stack
                      direction="row"
                      spacing={1}
                      sx={{ alignItems: 'center' }}
                    >
                      <Typography
                        variant="body2"
                        color="text.secondary"
                        sx={{ flexGrow: 1 }}
                      >
                        {entry.lots.some((lot) => lot.taken)
                          ? entry.lots
                              .filter((lot) => lot.taken)
                              .map((lot) =>
                                lot.expiresAt
                                  ? intl.formatMessage(
                                      {
                                        id: 'orders.ship.lotTakeExpiring',
                                        defaultMessage:
                                          '{code} (expires {day}): {quantity}',
                                      },
                                      {
                                        code: lot.code,
                                        day: formatDay(lot.expiresAt),
                                        quantity: formatQuantity(lot.take),
                                      },
                                    )
                                  : intl.formatMessage(
                                      {
                                        id: 'orders.ship.lotTake',
                                        defaultMessage: '{code}: {quantity}',
                                      },
                                      {
                                        code: lot.code,
                                        quantity: formatQuantity(lot.take),
                                      },
                                    ),
                              )
                              .join(SEPARATOR)
                          : intl.formatMessage({
                              id: 'orders.ship.noLots',
                              defaultMessage:
                                'No lots of this at the chosen location.',
                            })}
                      </Typography>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => startPicking(entry)}
                      >
                        {intl.formatMessage({
                          id: 'orders.ship.chooseLots',
                          defaultMessage: 'Choose lots',
                        })}
                      </Button>
                    </Stack>
                  )}

                  {entry?.tracksLots && picking && (
                    <>
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
                                  id: 'inventory.promised.onHand',
                                  defaultMessage: 'On hand',
                                })}
                              </TableCell>
                              <TableCell align="right">
                                {intl.formatMessage({
                                  id: 'orders.lines.ship',
                                  defaultMessage: 'Ship',
                                })}
                              </TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {entry.lots.map((lot) => (
                              <TableRow key={lot.lotId}>
                                <TableCell>{lot.code}</TableCell>
                                <TableCell>
                                  {lot.expiresAt
                                    ? formatDay(lot.expiresAt)
                                    : intl.formatMessage({
                                        id: 'orders.ship.noExpiry',
                                        defaultMessage: 'Does not expire',
                                      })}
                                </TableCell>
                                <TableCell align="right">
                                  {formatQuantity(lot.onHand)}
                                </TableCell>
                                <TableCell align="right" sx={{ width: 140 }}>
                                  <TextField
                                    size="small"
                                    value={picking[lot.lotId] ?? ''}
                                    onChange={(event) =>
                                      setPicks((current) => ({
                                        ...current,
                                        [line.id]: {
                                          ...current[line.id],
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
                                            id: 'orders.ship.fromLot',
                                            defaultMessage:
                                              'Ship from lot {code}',
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

                      <Stack
                        direction="row"
                        sx={{
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                      >
                        <Typography variant="caption" color="text.secondary">
                          {intl.formatMessage(
                            {
                              id: 'orders.ship.mustAddUp',
                              defaultMessage:
                                'Must add up to {quantity}. The server checks when you ship.',
                            },
                            { quantity: quantities[line.id] },
                          )}
                        </Typography>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => stopPicking(line.id)}
                        >
                          {intl.formatMessage({
                            id: 'orders.ship.earliestExpiry',
                            defaultMessage: 'Use earliest expiry',
                          })}
                        </Button>
                      </Stack>
                    </>
                  )}
                </Stack>
              );
            })}

            <Stack direction="row" spacing={2}>
              <TextField
                id="ship-carrier"
                label={intl.formatMessage({
                  id: 'orders.ship.carrier',
                  defaultMessage: 'Carrier',
                })}
                fullWidth
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                id="ship-tracking"
                label={intl.formatMessage({
                  id: 'orders.ship.tracking',
                  defaultMessage: 'Tracking number',
                })}
                fullWidth
                value={trackingNumber}
                onChange={(event) => setTracking(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>

            <TextField
              id="ship-note"
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

            <Typography variant="caption" color="text.secondary">
              {intl.formatMessage({
                id: 'orders.ship.together',
                defaultMessage:
                  'Everything listed ships together, or nothing does. Set a line to 0 to leave it for a later shipment.',
              })}
            </Typography>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'orders.lines.ship',
            defaultMessage: 'Ship',
          })}
          pendingLabel={intl.formatMessage({
            id: 'orders.ship.pending',
            defaultMessage: 'Shipping…',
          })}
          disabled={!fromLocationId || sending.length === 0}
        />
      </form>
    </Dialog>
  );
}
