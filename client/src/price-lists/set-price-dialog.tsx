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
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';

/**
 * Sets one item's price on a list: adds it, or corrects what is there. With
 * an item given, the item is fixed and only the price changes.
 *
 * Orders already priced from the list keep what they were given (ADR-049);
 * the helper text says so, because it is the question someone correcting a
 * price will ask.
 */
export function SetPriceDialog({
  open,
  priceListId,
  currency,
  item,
  excludeVariantIds,
  onClose,
  onSaved,
}: {
  open: boolean;
  priceListId: string;
  currency: string;
  /** The item being corrected, or null to add one. */
  item: { variantId: string; sku: string; unitPrice: string } | null;
  /** Items already on the list, left out of the picker when adding. */
  excludeVariantIds: string[];
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const { variants, failed } = useVariants(open && item === null);
  const [variantId, setVariantId] = useState(item?.variantId ?? '');
  const [unitPrice, setUnitPrice] = useState(item?.unitPrice ?? '');

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Price saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(() =>
      api(`/price-lists/${priceListId}/items/${variantId}`, {
        method: 'PUT',
        body: JSON.stringify({ unitPrice: unitPrice.trim() }),
      }),
    );
  }

  const excluded = new Set(excludeVariantIds);
  const choices = variants.filter((row) => !excluded.has(row.id));

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {item ? `Price for ${item.sku}` : 'Add a price'}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {item === null && (
              <VariantPicker
                id="set-price-variant"
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
            )}

            <TextField
              id="set-price-unit-price"
              label={`Unit price (${currency})`}
              required
              value={unitPrice}
              onChange={(event) => setUnitPrice(event.target.value)}
              helperText="Per unit, before tax. Orders already priced from this list keep their price."
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || !variantId}>
            {submitting ? 'Saving…' : 'Save price'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
