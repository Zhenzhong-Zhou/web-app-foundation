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
 * Quantity only, and a dialog rather than an inline field.
 *
 * On a confirmed order this is a change to something a supplier was told, not
 * a typo fix — it deserves an explicit Save and it lands in the audit log
 * either way (ADR-033). Inline editing suits a SKU rename, where the old value
 * was simply wrong.
 *
 * No item picker: pointing a line at a different variant is not an edit but a
 * different line. Remove and add instead, both recorded.
 *
 * Keyed on the line by the caller, so the field seeds from props at mount.
 */
export function EditOrderLineDialog({
  open,
  orderId,
  orderStatus,
  line,
  onClose,
  onSaved,
}: {
  open: boolean;
  orderId: string;
  orderStatus: OrderStatus;
  line: OrderLine | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [quantity, setQuantity] = useState(line?.quantityOrdered ?? '');

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onSaved();
  });

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
        body: JSON.stringify({ quantityOrdered: quantity }),
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
              // Worth saying: on a draft this is a correction, on a confirmed
              // order it changes what the supplier was told.
              <Alert severity="info">
                This order has been confirmed. Changing the quantity amends what
                was agreed with the supplier.
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
