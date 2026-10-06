import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import type { Variant } from './products-page';
import { unitLabel, UNITS } from './units';

const EMPTY = {
  name: '',
  unitOfMeasure: 'each',
  weightGrams: '',
  lengthMm: '',
  widthMm: '',
  heightMm: '',
  caseQuantity: '',
};

/**
 * Physical facts about the variant. Two sets of dimensions because they answer
 * different questions: the item's size a bin, the case's size a pallet and a
 * freight quote (ADR-023).
 *
 * Entered and stored in base units — grams and millimetres, as integers.
 * Displaying pounds and inches is a formatting concern; converting on entry
 * would mean sending the unit alongside every value, which is an open
 * decision, not something to guess at here.
 *
 * SKU is edited inline on the detail page rather than here, because a rename
 * is a different kind of act from correcting a weight.
 */
export function EditVariantDialog({
  open,
  productId,
  variant,
  onClose,
  onSaved,
}: {
  open: boolean;
  productId: string;
  variant: Variant | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const intl = useIntl();
  const [form, setForm] = useState(EMPTY);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'products.variant.saved',
        defaultMessage: 'Variant saved',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    setLoadedFor(null);
    reset();
    onClose();
  }

  // Populated from the variant when the dialog opens for a new one, not in an
  // effect: an effect would fight the user's own edits on every re-render.
  if (variant && loadedFor !== variant.id) {
    setLoadedFor(variant.id);
    setForm({
      name: variant.name ?? '',
      unitOfMeasure: variant.unitOfMeasure,
      weightGrams: variant.weightGrams?.toString() ?? '',
      lengthMm: variant.lengthMm?.toString() ?? '',
      widthMm: variant.widthMm?.toString() ?? '',
      heightMm: variant.heightMm?.toString() ?? '',
      caseQuantity: variant.caseQuantity?.toString() ?? '',
    });
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  /** Empty means "no value", not zero — the columns are nullable. */
  function numberOrNull(value: string): number | undefined {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : Number(trimmed);
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!variant) return;

    void submit(() =>
      api(`/products/${productId}/variants/${variant.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name || undefined,
          unitOfMeasure: form.unitOfMeasure,
          weightGrams: numberOrNull(form.weightGrams),
          lengthMm: numberOrNull(form.lengthMm),
          widthMm: numberOrNull(form.widthMm),
          heightMm: numberOrNull(form.heightMm),
          caseQuantity: numberOrNull(form.caseQuantity),
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
          {intl.formatMessage(
            { id: 'products.variant.editTitle', defaultMessage: 'Edit {sku}' },
            { sku: variant?.sku },
          )}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-variant-name"
              label={intl.formatMessage({
                id: 'products.variation',
                defaultMessage: 'Size or variation',
              })}
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-variant-unit"
              label={intl.formatMessage({
                id: 'products.unitOfMeasure',
                defaultMessage: 'Unit of measure',
              })}
              select
              required
              fullWidth
              value={form.unitOfMeasure}
              onChange={update('unitOfMeasure')}
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unitLabel(unit, intl)}
                </MenuItem>
              ))}
            </TextField>

            <Typography variant="subtitle2">
              {intl.formatMessage({
                id: 'products.variant.theItem',
                defaultMessage: 'The item',
              })}
            </Typography>

            <TextField
              id="edit-variant-weight"
              label={intl.formatMessage({
                id: 'products.variant.weightGrams',
                defaultMessage: 'Weight (g)',
              })}
              type="number"
              fullWidth
              value={form.weightGrams}
              onChange={update('weightGrams')}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                id="edit-variant-length"
                label={intl.formatMessage({
                  id: 'products.variant.lengthMm',
                  defaultMessage: 'Length (mm)',
                })}
                type="number"
                fullWidth
                value={form.lengthMm}
                onChange={update('lengthMm')}
              />
              <TextField
                id="edit-variant-width"
                label={intl.formatMessage({
                  id: 'products.variant.widthMm',
                  defaultMessage: 'Width (mm)',
                })}
                type="number"
                fullWidth
                value={form.widthMm}
                onChange={update('widthMm')}
              />
              <TextField
                id="edit-variant-height"
                label={intl.formatMessage({
                  id: 'products.variant.heightMm',
                  defaultMessage: 'Height (mm)',
                })}
                type="number"
                fullWidth
                value={form.heightMm}
                onChange={update('heightMm')}
              />
            </Stack>

            <Typography variant="subtitle2">
              {intl.formatMessage({
                id: 'products.variant.theCase',
                defaultMessage: 'The case',
              })}
            </Typography>

            <TextField
              id="edit-variant-case-quantity"
              label={intl.formatMessage({
                id: 'products.variant.unitsPerCase',
                defaultMessage: 'Units per case',
              })}
              type="number"
              fullWidth
              value={form.caseQuantity}
              onChange={update('caseQuantity')}
              helperText={intl.formatMessage({
                id: 'products.variant.unitsPerCase.help',
                defaultMessage: 'How many of this variant ship in one case.',
              })}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'common.save',
            defaultMessage: 'Save',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
