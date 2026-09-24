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
import type { Location, ReturnableLine } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/** Why things usually come back. "Other" leaves the note to explain. */
const REASONS = [
  'damaged',
  'wrong item',
  'not wanted',
  'expired',
  'quality concern',
  'other',
];

/**
 * A quantity of nothing, recognised as text rather than parsed: "", "0",
 * "0.00". Quantities stay strings end to end (ADR-025).
 */
function isNothing(quantity: string | undefined): boolean {
  return /^\s*0*(\.0*)?\s*$/.test(quantity ?? '');
}

/** A tracked line sends its lots, an untracked one a quantity (ADR-043). */
type ReturnLinePayload =
  | { lineId: string; lots: { lotId: string; quantity: string }[] }
  | { lineId: string; quantity: string };

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
 */
export function ReturnOrderDialog({
  open,
  orderId,
  locations,
  onClose,
  onReturned,
}: {
  open: boolean;
  orderId: string;
  /** All leaves, unavailable ones included: that is where returns belong. */
  locations: Location[];
  onClose: () => void;
  onReturned: () => Promise<void> | void;
}) {
  const [lines, setLines] = useState<ReturnableLine[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

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
    { success: 'Return received' },
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
              : 'Could not load what shipped.',
          );
        }
      });

    return () => {
      ignore = true;
    };
  }, [open, orderId]);

  function close() {
    reset();
    onClose();
  }

  /** What would be sent: only lines with something coming back. */
  function payloadLines(): ReturnLinePayload[] {
    return (lines ?? []).flatMap((line): ReturnLinePayload[] => {
      if (line.tracksLots) {
        const lots = Object.entries(byLot[line.lineId] ?? {})
          .filter(([, quantity]) => !isNothing(quantity))
          .map(([lotId, quantity]) => ({ lotId, quantity: quantity.trim() }));

        return lots.length > 0 ? [{ lineId: line.lineId, lots }] : [];
      }

      const quantity = quantities[line.lineId];
      return isNothing(quantity)
        ? []
        : [{ lineId: line.lineId, quantity: quantity.trim() }];
    });
  }

  const sending = payloadLines();

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/orders/${orderId}/returns`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId,
          reason,
          note: note.trim() || undefined,
          lines: sending,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="md">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Take a return</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}
            {loadError && <Alert severity="error">{loadError}</Alert>}

            <Stack direction="row" spacing={2}>
              <TextField
                id="return-to"
                label="Put it in"
                select
                required
                fullWidth
                value={toLocationId}
                onChange={(event) => setTo(event.target.value)}
                helperText="Usually a bin marked not available, so nothing ships it again before it is checked."
              >
                {locations.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.name}
                    {location.isAvailable ? '' : ' (not available)'}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                id="return-reason"
                label="Why"
                select
                fullWidth
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              >
                {REASONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {option}
                  </MenuItem>
                ))}
              </TextField>
            </Stack>

            {lines?.map((line) => (
              <Stack key={line.lineId} spacing={1}>
                <Typography>
                  {line.sku}
                  <Typography
                    component="span"
                    variant="body2"
                    color="text.secondary"
                  >
                    {' '}
                    — {line.quantityFulfilled} shipped, {line.quantityReturned}{' '}
                    already back
                  </Typography>
                </Typography>

                {line.tracksLots ? (
                  <TableContainer>
                    <Table size="small">
                      <TableHead>
                        <TableRow>
                          <TableCell>Lot</TableCell>
                          <TableCell>Expires</TableCell>
                          <TableCell align="right">Shipped</TableCell>
                          <TableCell align="right">Already back</TableCell>
                          <TableCell align="right">Coming back</TableCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {line.lots.map((lot) => (
                          <TableRow key={lot.lotId}>
                            <TableCell>{lot.code}</TableCell>
                            <TableCell>
                              {lot.expiresAt ? formatDay(lot.expiresAt) : '—'}
                            </TableCell>
                            <TableCell align="right">{lot.shipped}</TableCell>
                            <TableCell align="right">{lot.returned}</TableCell>
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
                                    'aria-label': `Return from lot ${lot.code}`,
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
                    label="Coming back"
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
                        'aria-label': `Return ${line.sku}`,
                      },
                    }}
                    helperText={line.unitOfMeasure}
                    sx={{ width: 180 }}
                  />
                )}
              </Stack>
            ))}

            {lines?.length === 0 && (
              <Typography color="text.secondary">
                Nothing has shipped on this order, so nothing can come back.
              </Typography>
            )}

            <TextField
              id="return-note"
              label="Note"
              fullWidth
              multiline
              minRows={2}
              value={note}
              onChange={(event) => setNote(event.target.value)}
              helperText="What the customer said, or what you found in the box."
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <Typography variant="caption" color="text.secondary">
              Nothing is restocked here. Once checked, move it to a shelf, or
              correct the count if it is being written off.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={submitting || !toLocationId || sending.length === 0}
          >
            {submitting ? 'Receiving…' : 'Receive return'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
