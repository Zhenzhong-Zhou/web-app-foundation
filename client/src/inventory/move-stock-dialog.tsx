import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import type { Location, StockRow } from './inventory-page';

export type MoveMode = 'ship' | 'transfer' | 'adjust';

/**
 * Three entry points, one form.
 *
 * Receiving is a different shape and has its own dialog: it starts with a box
 * and asks where it goes. These three start from a pile already on a shelf, so
 * the row supplies the variant, the location, and the lot — and what is left
 * differs only in whether there is a destination and whether a note is
 * required. Three forms would be three copies of the same quantity field.
 *
 * The variant and source are shown, not chosen. Picking them again would let
 * someone act on a different pile than the one they were looking at, which is
 * the mistake this shape exists to prevent.
 */
const MODES: Record<
  MoveMode,
  { title: string; verb: string; reason: string; needsDestination: boolean }
> = {
  ship: {
    title: 'Ship out',
    verb: 'Ship',
    reason: 'shipment',
    needsDestination: false,
  },
  transfer: {
    title: 'Move to another location',
    verb: 'Move',
    reason: 'transfer',
    needsDestination: true,
  },
  adjust: {
    title: 'Correct the count',
    verb: 'Save correction',
    reason: 'adjustment',
    needsDestination: false,
  },
};

const REASON_DETAILS = ['miscount', 'damaged', 'expired', 'lost', 'found'];

export function MoveStockDialog({
  mode,
  row,
  locations,
  onClose,
  onMoved,
}: {
  mode: MoveMode;
  row: StockRow | null;
  locations: Location[];
  onClose: () => void;
  onMoved: () => Promise<void>;
}) {
  const config = MODES[mode];

  const [form, setForm] = useState({
    quantity: '',
    toLocationId: '',
    reasonDetail: 'miscount',
    note: '',
    direction: 'remove',
  });

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onMoved();
  });

  function close() {
    setForm({
      quantity: '',
      toLocationId: '',
      reasonDetail: 'miscount',
      note: '',
      direction: 'remove',
    });
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!row) return;

    /**
     * An adjustment is the only reason that goes either way: a miscount can
     * reveal more on the shelf than recorded, or less. Everything else has one
     * direction, encoded by which location column is set (ADR-023).
     */
    const adding = mode === 'adjust' && form.direction === 'add';

    void submit(() =>
      api('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: row.variantId,
          lotId: row.lotId ?? undefined,
          fromLocationId: adding ? undefined : row.locationId,
          toLocationId: adding
            ? row.locationId
            : form.toLocationId || undefined,
          quantity: form.quantity,
          reason: config.reason,
          reasonDetail: mode === 'adjust' ? form.reasonDetail : undefined,
          note: mode === 'adjust' ? form.note : form.note || undefined,
        }),
      }),
    );
  }

  const elsewhere = locations.filter(
    (location) => location.id !== row?.locationId,
  );

  return (
    <Dialog
      key={`${mode}:${row?.variantId}:${row?.locationId}:${row?.lotId ?? ''}`}
      open={!!row}
      onClose={close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>{config.title}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && (
              <Alert severity="error" aria-label="Error">
                {error}
              </Alert>
            )}

            {/* Shown rather than chosen: the person is acting on the pile they
                were looking at, and re-picking it invites acting on a
                different one. */}
            {row && (
              <Typography variant="body2" color="text.secondary">
                {row.sku}
                {row.lotCode ? ` · lot ${row.lotCode}` : ''} at{' '}
                {row.locationName} — {row.quantity} {row.unitOfMeasure} on hand
              </Typography>
            )}

            {mode === 'adjust' && (
              <TextField
                id="move-direction"
                label="The shelf has"
                select
                required
                fullWidth
                value={form.direction}
                onChange={update('direction')}
              >
                <MenuItem value="remove">Less than recorded</MenuItem>
                <MenuItem value="add">More than recorded</MenuItem>
              </TextField>
            )}

            {config.needsDestination && (
              <TextField
                id="move-destination"
                label="To"
                select
                required
                fullWidth
                value={form.toLocationId}
                onChange={update('toLocationId')}
                helperText="Only locations that hold stock directly are listed."
              >
                {elsewhere.map((location) => (
                  <MenuItem key={location.id} value={location.id}>
                    {location.code
                      ? `${location.name} (${location.code})`
                      : location.name}
                  </MenuItem>
                ))}
              </TextField>
            )}

            <TextField
              id="move-quantity"
              label={mode === 'adjust' ? 'Difference' : 'Quantity'}
              required
              fullWidth
              value={form.quantity}
              onChange={update('quantity')}
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              /**
               * A difference, not a new total. The endpoint takes a delta, and
               * asking for "I counted 45" would mean reading the balance and
               * subtracting — which lands on a different number if anything
               * moves in between. Recorded as an open decision; until it is
               * settled the form asks for what it actually sends.
               */
              helperText={
                mode === 'adjust'
                  ? `How many ${row?.unitOfMeasure ?? 'units'} out, not the new total.`
                  : `In ${row?.unitOfMeasure ?? 'units'}. Up to 4 decimal places.`
              }
            />

            {mode === 'adjust' && (
              <>
                <TextField
                  id="move-reason-detail"
                  label="Why"
                  select
                  required
                  fullWidth
                  value={form.reasonDetail}
                  onChange={update('reasonDetail')}
                >
                  {REASON_DETAILS.map((detail) => (
                    <MenuItem key={detail} value={detail}>
                      {detail}
                    </MenuItem>
                  ))}
                </TextField>

                {/* Required, and the server refuses without it. A receipt
                    explains itself; an adjustment is a person asserting the
                    system is wrong, and a blank one is unauditable
                    (ADR-023). */}
                <TextField
                  id="move-note"
                  label="What happened"
                  required
                  fullWidth
                  multiline
                  minRows={2}
                  value={form.note}
                  onChange={update('note')}
                  helperText="Whoever reads this in six months was not there."
                  slotProps={{ htmlInput: { maxLength: 500 } }}
                />
              </>
            )}

            {mode !== 'adjust' && (
              <TextField
                id="move-note"
                label="Note"
                fullWidth
                value={form.note}
                onChange={update('note')}
                slotProps={{ htmlInput: { maxLength: 500 } }}
              />
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : config.verb}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
