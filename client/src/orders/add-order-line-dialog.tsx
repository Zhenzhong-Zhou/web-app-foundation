import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { OrderDetail, VariantOption } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Adds an item to a draft.
 *
 * Items already on the order are excluded: the server refuses a duplicate with
 * a 409 (one line per variant, so that "how much did we order" has one
 * answer), and offering a choice that always fails is a worse way to learn
 * that than not offering it.
 */
export function AddOrderLineDialog({
  open,
  order,
  variants,
  onClose,
  onAdded,
}: {
  open: boolean;
  order: OrderDetail;
  variants: VariantOption[];
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}) {
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onAdded();
  });

  function close() {
    setVariantId('');
    setQuantity('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/orders/${order.id}/lines`, {
        method: 'POST',
        // The string as typed. Number() here would undo numeric(18,4).
        body: JSON.stringify({ variantId, quantityOrdered: quantity }),
      }),
    );
  }

  const onOrder = new Set(order.lines.map((line) => line.variantId));
  const choices = variants.filter((row) => !onOrder.has(row.id));

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add an item</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="add-line-variant"
              label="Item"
              select
              required
              fullWidth
              value={variantId}
              onChange={(event) => setVariantId(event.target.value)}
            >
              {choices.map((row) => (
                <MenuItem key={row.id} value={row.id}>
                  {row.sku} — {row.productName}
                  {row.variantName ? ` (${row.variantName})` : ''}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="add-line-quantity"
              label="Quantity"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              helperText={
                variants.find((row) => row.id === variantId)?.unitOfMeasure
                  ? `In ${variants.find((row) => row.id === variantId)!.unitOfMeasure}.`
                  : 'Up to 4 decimal places.'
              }
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add item'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
