import {
  Alert,
  Button,
  Dialog,
  DialogActions,
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

import { FormError } from '../components/form-error';
import { api, ApiError } from '../lib/api';
import { formatDay } from '../lib/format';
import type {
  Location,
  OrderDetail,
  OrderLine,
  ShipmentPlanLine,
} from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * A quantity of nothing, recognised as text rather than parsed: "", "0",
 * "0.00". Quantities stay strings end to end (ADR-025), so zero is a shape,
 * not a number compared against 0.
 */
function isNothing(quantity: string): boolean {
  return /^\s*0*(\.0*)?\s*$/.test(quantity);
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
  const outstanding = order.lines.filter(
    (line) => !line.isComplete && !line.isClosedShort,
  );

  const [fromLocationId, setFrom] = useState('');
  const [carrier, setCarrier] = useState('');
  const [trackingNumber, setTracking] = useState('');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      outstanding.map((line) => [line.id, line.quantityOutstanding]),
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
    { success: 'Shipped' },
  );

  const sending = outstanding.filter(
    (line) => !isNothing(quantities[line.id] ?? ''),
  );

  /**
   * What the preview is asked about, as one string, so the effect reruns
   * when a quantity changes and not on every render.
   */
  const request = JSON.stringify(
    sending.map((line) => [line.id, quantities[line.id].trim()]),
  );

  // Previewed after a short pause, so typing "120" asks once, not three
  // times. State is only ever set in the callback, never in the effect body.
  useEffect(() => {
    if (!open || !fromLocationId || sending.length === 0) return;

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
                : 'Could not check stock.',
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
        entry.lots.map((lot) => [lot.lotId, lot.taken ? lot.take : '']),
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

    void submit(() =>
      api(`/orders/${order.id}/shipments`, {
        method: 'POST',
        body: JSON.stringify({
          fromLocationId,
          carrier: carrier.trim() || undefined,
          trackingNumber: trackingNumber.trim() || undefined,
          note: note.trim() || undefined,
          lines: sending.map((line) => {
            const byLot = picks[line.id];
            const lots = byLot
              ? Object.entries(byLot)
                  .filter(([, quantity]) => !isNothing(quantity))
                  .map(([lotId, quantity]) => ({
                    lotId,
                    quantity: quantity.trim(),
                  }))
              : [];

            return {
              lineId: line.id,
              quantity: quantities[line.id].trim(),
              lots: lots.length > 0 ? lots : undefined,
            };
          }),
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Ship</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="ship-from"
              label="Ship from"
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
                      >
                        {' '}
                        — {line.quantityOutstanding} outstanding
                      </Typography>
                    </Typography>

                    <TextField
                      size="small"
                      label="Ship"
                      value={quantities[line.id] ?? ''}
                      onChange={(event) =>
                        setQuantity(line.id, event.target.value)
                      }
                      slotProps={{
                        htmlInput: {
                          inputMode: 'decimal',
                          maxLength: 19,
                          'aria-label': `Ship ${line.sku}`,
                        },
                      }}
                      sx={{ width: 140 }}
                    />
                  </Stack>

                  {entry?.exceedsOutstanding && (
                    <Alert severity="warning">
                      More than the {line.quantityOutstanding} still
                      outstanding. The server will refuse it.
                    </Alert>
                  )}

                  {entry?.shortBy && (
                    <Alert severity="warning">
                      This location is {entry.shortBy} short of {line.sku}.
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
                              .map(
                                (lot) =>
                                  `${lot.code}${lot.expiresAt ? ` (expires ${formatDay(lot.expiresAt)})` : ''}: ${lot.take}`,
                              )
                              .join(' · ')
                          : 'No lots of this at the chosen location.'}
                      </Typography>
                      <Button
                        variant="text"
                        size="small"
                        onClick={() => startPicking(entry)}
                      >
                        Choose lots
                      </Button>
                    </Stack>
                  )}

                  {entry?.tracksLots && picking && (
                    <>
                      <TableContainer>
                        <Table size="small">
                          <TableHead>
                            <TableRow>
                              <TableCell>Lot</TableCell>
                              <TableCell>Expires</TableCell>
                              <TableCell align="right">On hand</TableCell>
                              <TableCell align="right">Ship</TableCell>
                            </TableRow>
                          </TableHead>
                          <TableBody>
                            {entry.lots.map((lot) => (
                              <TableRow key={lot.lotId}>
                                <TableCell>{lot.code}</TableCell>
                                <TableCell>
                                  {lot.expiresAt
                                    ? formatDay(lot.expiresAt)
                                    : 'Does not expire'}
                                </TableCell>
                                <TableCell align="right">
                                  {lot.onHand}
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
                                        'aria-label': `Ship from lot ${lot.code}`,
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
                          Must add up to {quantities[line.id]}. The server
                          checks when you ship.
                        </Typography>
                        <Button
                          variant="text"
                          size="small"
                          onClick={() => stopPicking(line.id)}
                        >
                          Use earliest expiry
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
                label="Carrier"
                fullWidth
                value={carrier}
                onChange={(event) => setCarrier(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
              <TextField
                id="ship-tracking"
                label="Tracking number"
                fullWidth
                value={trackingNumber}
                onChange={(event) => setTracking(event.target.value)}
                slotProps={{ htmlInput: { maxLength: 100 } }}
              />
            </Stack>

            <TextField
              id="ship-note"
              label="Note"
              fullWidth
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <Typography variant="caption" color="text.secondary">
              Everything listed ships together, or nothing does. Set a line to 0
              to leave it for a later shipment.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !fromLocationId || sending.length === 0}
          >
            {submitting ? 'Shipping…' : 'Ship'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
