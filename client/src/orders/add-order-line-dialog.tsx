import {
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
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import type { OrderDetail } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';

/**
 * Adds an item to a draft.
 *
 * Items already on the order are excluded: the server refuses a duplicate with
 * a 409 (one line per variant, so "how much did we order" has one answer), and
 * offering a choice that always fails is a worse way to learn that than not
 * offering it.
 *
 * The catalogue is fetched here, on open, rather than handed down from the
 * page: a variant created after the order page loaded is exactly the one
 * someone opens this dialog to add (useVariants).
 */
export function AddOrderLineDialog({
  open,
  order,
  onClose,
  onAdded,
}: {
  open: boolean;
  order: OrderDetail;
  onClose: () => void;
  onAdded: () => Promise<void> | void;
}) {
  const { variants, failed } = useVariants(open);
  const [variantId, setVariantId] = useState('');
  const [quantity, setQuantity] = useState('');
  const [price, setPrice] = useState('');

  /**
   * Seeded from the order's other lines. A currency per line supports a mixed
   * order (ADR-035), but mixed is the exception — so the default should be the
   * case that is not, and typing it again on every line is the friction that
   * makes people leave prices blank.
   */
  const [currency, setCurrency] = useState(
    order.lines.find((row) => row.currency)?.currency ?? '',
  );

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onAdded();
  });

  function close() {
    setVariantId('');
    setQuantity('');
    setPrice('');
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/orders/${order.id}/lines`, {
        method: 'POST',
        body: JSON.stringify({
          variantId,
          // Strings as typed. Number() here would undo numeric(18,4).
          quantityOrdered: quantity,
          // Both or neither: the server refuses half a price, and sending an
          // empty string would fail the format check rather than read as
          // absent.
          unitPrice: price.trim() || undefined,
          currency: price.trim() ? currency : undefined,
        }),
      }),
    );
  }

  const onOrder = new Set(order.lines.map((line) => line.variantId));
  const choices = variants.filter((row) => !onOrder.has(row.id));
  const unit = variants.find((row) => row.id === variantId)?.unitOfMeasure;

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add an item</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <VariantPicker
              id="add-line-variant"
              label="Item"
              required
              options={choices}
              value={variantId}
              onChange={setVariantId}
              helperText={
                failed
                  ? 'Could not load the catalogue. Close and try again.'
                  : undefined
              }
            />

            <TextField
              id="add-line-quantity"
              label="Quantity"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              helperText={unit ? `In ${unit}.` : 'Up to 4 decimal places.'}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            {/* A pair, because neither half is useful alone — a price with no
                currency is a number with no unit (ADR-035). */}
            <Stack direction="row" spacing={2}>
              <TextField
                id="add-line-price"
                label="Unit price"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                helperText="Optional. Zero is valid for a free line."
                sx={{ flexGrow: 1 }}
                slotProps={{
                  htmlInput: { inputMode: 'decimal', maxLength: 19 },
                }}
              />

              <TextField
                id="add-line-currency"
                label="Currency"
                required={price.trim() !== ''}
                value={currency}
                // Uppercased on the way in rather than validated on the way
                // out: the server takes ISO 4217 and "cad" is a typo nobody
                // means.
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
            {submitting ? 'Adding…' : 'Add item'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
