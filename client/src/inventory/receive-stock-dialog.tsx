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
} from '@mui/material';
import { type SubmitEvent, useEffect, useState } from 'react';

import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import type { Location } from './inventory-page';

interface Variant {
  id: string;
  sku: string;
  variantName: string | null;
  productName: string;
  type: string;
  unitOfMeasure: string;
  tracksLots: boolean;
}

const EMPTY = {
  variantId: '',
  locationId: '',
  quantity: '',
  lotCode: '',
  expiresAt: '',
};

/**
 * Receiving, and only receiving. Shipping, transfers, and adjustments go
 * through the same endpoint with a different reason, but they are different
 * jobs done by different people at different moments — one form with a reason
 * dropdown would make every one of them slower to use.
 */
export function ReceiveStockDialog({
  open,
  locations,
  defaultLocationId,
  onClose,
  onReceived,
}: {
  open: boolean;
  locations: Location[];
  defaultLocationId: string;
  onClose: () => void;
  onReceived: () => Promise<void>;
}) {
  const [form, setForm] = useState({ ...EMPTY, locationId: defaultLocationId });
  const [variants, setVariants] = useState<Variant[]>([]);

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onReceived();
  });

  const variant = variants.find((item) => item.id === form.variantId);

  // Loaded when the dialog opens rather than on mount: the catalogue changes
  // between visits, and a list fetched once at page load goes stale in exactly
  // the case that matters — a product added a moment ago, to be received now.
  useEffect(() => {
    if (!open) return;
    let ignore = false;

    void api<Variant[]>('/products/variants')
      .then((all) => {
        if (!ignore) setVariants(all);
      })
      .catch(() => {
        // The submit error surfaces this well enough; an empty picker with no
        // explanation is the only bad outcome and the required field covers it.
      });

    return () => {
      ignore = true;
    };
  }, [open]);

  function close() {
    setForm({ ...EMPTY, locationId: defaultLocationId });
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void submit(() =>
      api('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: form.variantId,
          toLocationId: form.locationId,
          // Sent as the string the person typed. Number() here would undo the
          // decision numeric(18, 4) exists to enforce (ADR-025).
          quantity: form.quantity,
          reason: 'receipt',
          // The lot is created with the movement — it arrives printed on the
          // box, and a separate call would leave an orphan whenever this fails.
          lot: variant?.tracksLots
            ? {
                code: form.lotCode,
                expiresAt: form.expiresAt
                  ? new Date(form.expiresAt).toISOString()
                  : undefined,
              }
            : undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Receive stock</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="receive-variant"
              label="Item"
              select
              required
              fullWidth
              value={form.variantId}
              onChange={update('variantId')}
            >
              {variants.map((item) => (
                <MenuItem key={item.id} value={item.id}>
                  {item.sku} — {item.productName}
                  {item.variantName ? ` (${item.variantName})` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="receive-location"
              label="Into"
              select
              required
              fullWidth
              value={form.locationId}
              onChange={update('locationId')}
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
              id="receive-quantity"
              label="Quantity"
              required
              fullWidth
              value={form.quantity}
              onChange={update('quantity')}
              /**
               * inputMode rather than type="number". A number input coerces,
               * strips leading zeros, and hands back a value the browser has
               * already interpreted — and the server wants the digits as typed.
               * inputMode gets the numeric keypad on a phone without any of it.
               */
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              helperText={
                variant
                  ? `In ${variant.unitOfMeasure}. Up to 4 decimal places.`
                  : 'Up to 4 decimal places.'
              }
            />

            {/* Shown only for a lot-tracked variant, because the server refuses
                a lot on one that is not — and refuses a movement without one on
                one that is (ADR-023). The form follows the same rule rather
                than letting someone fill in a field that will be rejected. */}
            {variant?.tracksLots && (
              <>
                <TextField
                  id="receive-lot-code"
                  label="Lot number"
                  required
                  fullWidth
                  value={form.lotCode}
                  onChange={update('lotCode')}
                  helperText="As printed on the box. Receiving the same lot again adds to it."
                />

                <TextField
                  id="receive-expires-at"
                  label="Expires"
                  type="date"
                  fullWidth
                  value={form.expiresAt}
                  onChange={update('expiresAt')}
                  slotProps={{ inputLabel: { shrink: true } }}
                  helperText="Leave blank if it does not expire. Ignored if this lot already exists."
                />
              </>
            )}
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
