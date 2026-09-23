import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { OrderLine, OrderStatus } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Quantity and price, and a dialog rather than inline fields.
 *
 * On a confirmed order this changes something a supplier was told, not a typo
 * — it deserves an explicit save, and it lands in the audit log either way
 * (ADR-033). Inline editing suits a SKU rename, where the old value was simply
 * wrong.
 *
 * No item picker: pointing a line at a different variant is not an edit but a
 * different line. Remove and add instead, both recorded.
 *
 * Keyed on the line by the caller, so every field seeds from props at mount.
 */
export function EditOrderLineDialog({
  open,
  orderId,
  orderStatus,
  line,
  defaultCurrency,
  onClose,
  onSaved,
}: {
  open: boolean;
  orderId: string;
  orderStatus: OrderStatus;
  line: OrderLine | null;
  /** The order's prevailing currency, for a line that has none yet. */
  defaultCurrency: string;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [quantity, setQuantity] = useState(line?.quantityOrdered ?? '');
  const [price, setPrice] = useState(line?.unitPrice ?? '');
  const [currency, setCurrency] = useState(line?.currency ?? defaultCurrency);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Line saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!line) return;

    void submit(() =>
      api(`/orders/${orderId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantityOrdered: quantity,
          /**
           * Omitted entirely when blank, which leaves the stored price
           * untouched rather than clearing it. There is deliberately no way to
           * un-price a line here: the route has no representation for it, and
           * inventing one from an empty field would make a cleared price
           * indistinguishable from an unchanged one.
           */
          unitPrice: price.trim() || undefined,
          currency: price.trim() ? currency : undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{line?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {orderStatus === 'confirmed' && (
              // On a draft this is a correction; here it changes what the
              // supplier was told.
              <Alert severity="info">
                This order has been confirmed. Changing the quantity or price
                amends what was agreed with the supplier.
              </Alert>
            )}

            <TextField
              id="edit-line-quantity"
              label="Quantity"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {/* A pair, because neither half is useful alone (ADR-035). */}
            <Stack direction="row" spacing={2}>
              <TextField
                id="edit-line-price"
                label="Unit price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                helperText="Leave blank to keep the current price."
                sx={{ flexGrow: 1 }}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', maxLength: 19 },
                }}
              />

              <TextField
                id="edit-line-currency"
                label="Currency"
                required={price.trim() !== ''}
                value={currency}
                onChange={(event) =>
                  setCurrency(event.target.value.toUpperCase())
                }
                sx={{ width: 120 }}
                slotProps={{ htmlInput: { maxLength: 3 } }}
              />
            </Stack>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : 'Save'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
