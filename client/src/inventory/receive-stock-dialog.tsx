import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import { groupedNumberMessage, nameAndCode, toApiDecimal } from '../lib/format';
import type { Location } from '../lib/types';
import { useSubmit } from '../lib/use-submit';
import { useVariants } from '../lib/use-variants';
import { unitLabel } from '../products/units';
import { LotFields } from './lot-fields';

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
  const intl = useIntl();
  const [form, setForm] = useState({ ...EMPTY, locationId: defaultLocationId });
  // Set when the quantity is typed with a thousands separator (ADR-054).
  const [quantityError, setQuantityError] = useState<string | null>(null);
  const { variants, failed: variantsError } = useVariants(open);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onReceived();
    },
    {
      success: intl.formatMessage({
        id: 'inventory.received',
        defaultMessage: 'Stock received',
      }),
    },
  );

  const variant = variants.find((item) => item.id === form.variantId);

  function close() {
    setForm({ ...EMPTY, locationId: defaultLocationId });
    setQuantityError(null);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // The language's decimal comma becomes the point the API takes; a
    // thousands separator is refused here rather than guessed at (ADR-054).
    const quantity = toApiDecimal(form.quantity);
    if (quantity === null) {
      setQuantityError(groupedNumberMessage());
      return;
    }
    setQuantityError(null);

    void submit(() =>
      api('/stock/movements', {
        method: 'POST',
        body: JSON.stringify({
          variantId: form.variantId,
          toLocationId: form.locationId,
          // Sent as the string the person typed, with only its decimal
          // separator made a point. Number() here would undo the decision
          // numeric(18, 4) exists to enforce (ADR-025).
          quantity,
          reason: 'receipt',
          // The lot is created with the movement — it arrives printed on the
          // box, and a separate call would leave an orphan whenever this fails.
          lot: variant?.tracksLots
            ? {
                code: form.lotCode,
                // As typed, YYYY-MM-DD (ADR-052).
                expiresAt: form.expiresAt || undefined,
              }
            : undefined,
        }),
      }),
    );
  }

  return (
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {intl.formatMessage({
            id: 'inventory.receive',
            defaultMessage: 'Receive stock',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            {variantsError && (
              <FormError
                message={intl.formatMessage({
                  id: 'inventory.catalogueFailed',
                  defaultMessage: 'Could not load the catalogue.',
                })}
              />
            )}

            {!variantsError && !variants.length && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'inventory.receive.noProducts',
                  defaultMessage:
                    'No products yet. Add one on the Products screen — stock is counted against a variant, so there has to be something to count.',
                })}
              </Alert>
            )}

            <VariantPicker
              id="receive-variant"
              label={intl.formatMessage({
                id: 'inventory.item',
                defaultMessage: 'Item',
              })}
              required
              options={variants}
              value={form.variantId}
              onChange={(variantId) =>
                setForm((current) => ({ ...current, variantId }))
              }
            />

            <TextField
              id="receive-location"
              label={intl.formatMessage({
                id: 'inventory.into',
                defaultMessage: 'Into',
              })}
              select
              required
              fullWidth
              value={form.locationId}
              onChange={update('locationId')}
            >
              {locations.map((location) => (
                <MenuItem key={location.id} value={location.id}>
                  {nameAndCode(location.name, location.code)}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="receive-quantity"
              label={intl.formatMessage({
                id: 'inventory.quantity',
                defaultMessage: 'Quantity',
              })}
              required
              fullWidth
              value={form.quantity}
              onChange={(event) => {
                setQuantityError(null);
                update('quantity')(event);
              }}
              /**
               * inputMode rather than type="number". A number input coerces,
               * strips leading zeros, and hands back a value the browser has
               * already interpreted — and the server wants the digits as typed.
               * inputMode gets the numeric keypad on a phone without any of it.
               */
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              error={!!quantityError}
              helperText={
                quantityError ??
                (variant
                  ? intl.formatMessage(
                      {
                        id: 'inventory.quantity.inUnit',
                        defaultMessage: 'In {unit}. Up to 4 decimal places.',
                      },
                      { unit: unitLabel(variant.unitOfMeasure, intl) },
                    )
                  : intl.formatMessage({
                      id: 'inventory.quantity.help',
                      defaultMessage: 'Up to 4 decimal places.',
                    }))
              }
            />

            {/* Shown only for a lot-tracked variant, because the server refuses
                a lot on one that is not — and refuses a movement without one on
                one that is (ADR-023). The form follows the same rule rather
                than letting someone fill in a field that will be rejected. */}
            {variant?.tracksLots && (
              <LotFields
                idPrefix="receive"
                variantId={variant.id}
                value={{ code: form.lotCode, expiresAt: form.expiresAt }}
                onChange={(lot) =>
                  setForm((current) => ({
                    ...current,
                    lotCode: lot.code,
                    expiresAt: lot.expiresAt,
                  }))
                }
              />
            )}
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'inventory.receive.action',
            defaultMessage: 'Receive',
          })}
          pendingLabel={intl.formatMessage({
            id: 'inventory.receive.pending',
            defaultMessage: 'Receiving…',
          })}
        />
      </form>
    </Dialog>
  );
}
