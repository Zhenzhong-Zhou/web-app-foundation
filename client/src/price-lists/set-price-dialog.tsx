import {
  Dialog,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import {
  formatQuantity,
  groupedNumberMessage,
  toApiDecimal,
} from '../lib/format';
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
  const intl = useIntl();
  const { variants, failed } = useVariants(open && item === null);
  const [variantId, setVariantId] = useState(item?.variantId ?? '');
  // Shown the reader's way, 12,5000 in French, and read back the same.
  const [unitPrice, setUnitPrice] = useState(
    item ? formatQuantity(item.unitPrice) : '',
  );
  // Set when the price is typed with a thousands separator (ADR-054).
  const [priceError, setPriceError] = useState<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'priceLists.priceSaved',
        defaultMessage: 'Price saved',
      }),
    },
  );

  function close() {
    setPriceError(null);
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    const price = toApiDecimal(unitPrice);
    if (price === null) {
      setPriceError(groupedNumberMessage());
      return;
    }
    setPriceError(null);

    void submit(() =>
      api(`/price-lists/${priceListId}/items/${variantId}`, {
        method: 'PUT',
        body: JSON.stringify({ unitPrice: price }),
      }),
    );
  }

  const excluded = new Set(excludeVariantIds);
  const choices = variants.filter((row) => !excluded.has(row.id));

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {item
            ? intl.formatMessage(
                {
                  id: 'priceLists.priceFor',
                  defaultMessage: 'Price for {sku}',
                },
                { sku: item.sku },
              )
            : intl.formatMessage({
                id: 'priceLists.addPrice',
                defaultMessage: 'Add a price',
              })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {item === null && (
              <VariantPicker
                id="set-price-variant"
                label={intl.formatMessage({
                  id: 'inventory.item',
                  defaultMessage: 'Item',
                })}
                required
                options={choices}
                value={variantId}
                onChange={setVariantId}
                helperText={
                  failed
                    ? intl.formatMessage({
                        id: 'orders.lines.catalogueFailed',
                        defaultMessage:
                          'Could not load the catalogue. Close and try again.',
                      })
                    : undefined
                }
              />
            )}

            <TextField
              id="set-price-unit-price"
              label={intl.formatMessage(
                {
                  id: 'priceLists.unitPriceIn',
                  defaultMessage: 'Unit price ({currency})',
                },
                { currency },
              )}
              required
              value={unitPrice}
              onChange={(event) => {
                setPriceError(null);
                setUnitPrice(event.target.value);
              }}
              error={!!priceError}
              helperText={
                priceError ??
                intl.formatMessage({
                  id: 'priceLists.price.help',
                  defaultMessage:
                    'Per unit, before tax. Orders already priced from this list keep their price.',
                })
              }
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'priceLists.savePrice',
            defaultMessage: 'Save price',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
          disabled={!variantId}
        />
      </form>
    </Dialog>
  );
}
