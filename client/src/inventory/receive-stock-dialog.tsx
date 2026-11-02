import {
  Alert,
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import type { Location } from '../api/types.gen';
import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { VariantPicker } from '../components/variant-picker';
import { api } from '../lib/api';
import { groupedNumberMessage, nameAndCode, toApiDecimal } from '../lib/format';
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

/** The fields the form checks itself, in the order they are on screen (#310). */
const CHECKED = ['variantId', 'locationId', 'quantity', 'lotCode'] as const;
type Checked = (typeof CHECKED)[number];

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
  /**
   * What the form says under a field it refused: one left empty (#310), or
   * a quantity typed with a thousands separator (ADR-054).
   */
  const [errors, setErrors] = useState<Partial<Record<Checked, string>>>({});
  /**
   * Where focus goes for a field that is missing: its visible control. The
   * Into select's ref is MUI's handle, whose focus() is its box, never its
   * hidden input (#310).
   */
  const controls = {
    locationId: useRef<{ focus: () => void }>(null),
    quantity: useRef<HTMLInputElement>(null),
    lotCode: useRef<HTMLInputElement>(null),
  };
  const { variants, answered, failed: variantsError } = useVariants(open);

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
    setErrors({});
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  // A field's message goes once it changes.
  function clearError(field: Checked) {
    setErrors((current) => ({ ...current, [field]: undefined }));
  }

  function focusField(field: Checked) {
    if (field === 'variantId') {
      // The item picker takes no ref; its input carries the picker's id.
      document.getElementById('receive-variant')?.focus();
      return;
    }
    controls[field].current?.focus();
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // The language's decimal comma becomes the point the API takes; a
    // thousands separator is refused here rather than guessed at (ADR-054).
    const quantity = toApiDecimal(form.quantity);

    /**
     * The form checks itself (noValidate): the browser's own check focused
     * the Into select's hidden input and said nothing a screen reader could
     * place (#310). Each empty field says what it needs, in the app's
     * language, and focus goes to the first one's visible control.
     */
    const found: Partial<Record<Checked, string>> = {
      variantId: form.variantId
        ? undefined
        : intl.formatMessage({
            id: 'inventory.receive.itemMissing',
            defaultMessage: 'Choose an item.',
          }),
      locationId: form.locationId
        ? undefined
        : intl.formatMessage({
            id: 'inventory.receive.locationMissing',
            defaultMessage: 'Choose a location.',
          }),
      quantity: !form.quantity.trim()
        ? intl.formatMessage({
            id: 'inventory.receive.quantityMissing',
            defaultMessage: 'Type a quantity.',
          })
        : quantity === null
          ? groupedNumberMessage()
          : undefined,
      lotCode:
        variant?.tracksLots && !form.lotCode.trim()
          ? intl.formatMessage({
              id: 'inventory.receive.lotNumberMissing',
              defaultMessage: 'Type the lot number.',
            })
          : undefined,
    };
    setErrors(found);

    const first = CHECKED.find((field) => found[field]);
    if (first) {
      focusField(first);
      return;
    }
    // Never null here: its message would have been found first.
    if (quantity === null) return;

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
      <form noValidate onSubmit={handleSubmit}>
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

            {/* Only once the catalogue has answered: while it loads, an
                empty list says nothing about the products (#250). */}
            {answered && !variantsError && !variants.length && (
              <Alert severity="info">
                {intl.formatMessage({
                  id: 'inventory.receive.noProducts',
                  defaultMessage:
                    'No products yet. Add one on the Products screen — stock is counted against a variant, so there has to be something to count.',
                })}
              </Alert>
            )}

            {/* Where typing starts, not the dialog itself (#313). */}
            <VariantPicker
              id="receive-variant"
              autoFocus
              label={intl.formatMessage({
                id: 'inventory.item',
                defaultMessage: 'Item',
              })}
              required
              options={variants}
              loading={!answered}
              failed={variantsError}
              value={form.variantId}
              onChange={(variantId) => {
                clearError('variantId');
                setForm((current) => ({ ...current, variantId }));
              }}
              error={!!errors.variantId}
              helperText={errors.variantId}
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
              onChange={(event) => {
                clearError('locationId');
                update('locationId')(event);
              }}
              inputRef={controls.locationId}
              error={!!errors.locationId}
              helperText={errors.locationId}
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
              inputRef={controls.quantity}
              value={form.quantity}
              onChange={(event) => {
                clearError('quantity');
                update('quantity')(event);
              }}
              /**
               * inputMode rather than type="number". A number input coerces,
               * strips leading zeros, and hands back a value the browser has
               * already interpreted — and the server wants the digits as typed.
               * inputMode gets the numeric keypad on a phone without any of it.
               */
              slotProps={{ htmlInput: { inputMode: 'decimal' } }}
              error={!!errors.quantity}
              helperText={
                errors.quantity ??
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
                onChange={(lot) => {
                  if (lot.code !== form.lotCode) clearError('lotCode');
                  setForm((current) => ({
                    ...current,
                    lotCode: lot.code,
                    expiresAt: lot.expiresAt,
                  }));
                }}
                codeRef={controls.lotCode}
                codeError={errors.lotCode}
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
