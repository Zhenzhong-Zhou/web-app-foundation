import {
  Autocomplete,
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
import { type SubmitEvent, useEffect, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { Location, Lot, OrderLine, VariantOption } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { formatDate } from '../lib/format';

/**
 * Receiving against one line: a movement and a fulfilment in one transaction
 * (ADR-027).
 *
 * Deliberately close to ReceiveStockDialog and not shared with it. That one
 * picks a variant because nothing has been ordered; here the line already
 * names it, and the quantity is bounded by what was ordered. Merging them
 * would mean a component with two modes and a variant field that is sometimes
 * a choice and sometimes a label.
 */
export function ReceiveLineDialog({
  orderId,
  line,
  variant,
  locations,
  onClose,
  onReceived,
}: {
  orderId: string;
  line: OrderLine | null;
  variant: VariantOption | undefined;
  locations: Location[];
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    locationId: '',
    quantity: '',
    lotCode: '',
    lotExpiresAt: '',
    note: '',
  });
  const [knownLots, setKnownLots] = useState<Lot[]>([]);

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onReceived();
  });

  /**
   * The codes already on this variant, so a typo shows the real one sitting
   * beside it. freeSolo, because a genuinely new lot has to be typeable —
   * this is a prompt, not a constraint.
   */
  useEffect(() => {
    if (!variant?.tracksLots || !line) return;
    let ignore = false;

    void api<Lot[]>(`/stock/lots?variantId=${line.variantId}`)
      .then((rows) => {
        if (!ignore) setKnownLots(rows);
      })
      // Silent: the field still works typed, and an error here would be a
      // warning about an autocomplete nobody asked for.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [line, variant?.tracksLots]);

  function close() {
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!line) return;

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}/receipts`, {
        method: 'POST',
        body: JSON.stringify({
          toLocationId: form.locationId,
          quantity: form.quantity,
          // The lot is created with the movement — it arrives printed on the
          // box, not registered in advance.
          lot: variant?.tracksLots
            ? {
                code: form.lotCode,
                expiresAt: form.lotExpiresAt || undefined,
              }
            : undefined,
          note: form.note || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={!!line} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Receive {line?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <Typography variant="body2" color="text.secondary">
              {line?.quantityFulfilled} of {line?.quantityOrdered} received so
              far.
            </Typography>

            <TextField
              id="receive-line-location"
              label="Into"
              select
              required
              fullWidth
              value={form.locationId}
              onChange={update('locationId')}
              helperText="Only locations that hold stock directly are listed."
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {location.code
                    ? `${location.name} (${location.code})`
                    : location.name}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="receive-line-quantity"
              label="Quantity"
              required
              fullWidth
              value={form.quantity}
              onChange={update('quantity')}
              /**
               * inputMode rather than type="number". A number input coerces,
               * strips leading zeros, and hands back a value the browser has
               * already interpreted — and the server wants the digits as
               * typed (ADR-025).
               */
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              helperText={
                variant
                  ? `In ${variant.unitOfMeasure}. More than was ordered is refused.`
                  : 'More than was ordered is refused.'
              }
            />

            {/* Shown only for a lot-tracked variant, because the server
                refuses a lot on one that is not — and refuses a movement
                without one on a variant that is. */}
            {variant?.tracksLots && (
              <>
                <Autocomplete
                  freeSolo
                  options={knownLots}
                  getOptionLabel={(option) =>
                    typeof option === 'string' ? option : option.code
                  }
                  renderOption={(props, option) => (
                    <li {...props} key={option.id}>
                      <Stack>
                        <Typography variant="body2">{option.code}</Typography>
                        {/* The expiry is how someone spots the other mistake:
                            a code that exists but belongs to another run. */}
                        <Typography variant="caption" color="text.secondary">
                          {option.expiresAt
                            ? `Expires ${formatDate(option.expiresAt)}`
                            : 'No expiry'}
                          {option.isAssigned ? ' · code assigned here' : ''}
                        </Typography>
                      </Stack>
                    </li>
                  )}
                  inputValue={form.lotCode}
                  onInputChange={(_event, value) =>
                    setForm((current) => ({ ...current, lotCode: value }))
                  }
                  onChange={(_event, value) => {
                    if (typeof value === 'string' || !value) return;

                    /**
                     * Filled from the lot that was picked, because the server
                     * ignores a supplied expiry when the lot already exists —
                     * a second delivery does not rewrite the expiry of units
                     * already on the shelf. Leaving the field blank here
                     * would let someone type one that silently does nothing.
                     */
                    setForm((current) => ({
                      ...current,
                      lotCode: value.code,
                      lotExpiresAt: value.expiresAt
                        ? value.expiresAt.slice(0, 10)
                        : '',
                    }));
                  }}
                  renderInput={(params) => (
                    <TextField
                      {...params}
                      id="receive-line-lot-code"
                      label="Lot"
                      required
                      helperText="As printed on the box. Receiving the same lot again adds to it."
                    />
                  )}
                />

                <TextField
                  id="receive-line-lot-expires"
                  label="Expires"
                  type="date"
                  fullWidth
                  value={form.lotExpiresAt}
                  onChange={update('lotExpiresAt')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Leave blank if it does not expire. Ignored if this lot already exists."
                />
              </>
            )}

            <TextField
              id="receive-line-note"
              label="Note"
              fullWidth
              value={form.note}
              onChange={update('note')}
              helperText="Damage, a short count, anything the ledger should say."
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Receiving…' : 'Receive'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
