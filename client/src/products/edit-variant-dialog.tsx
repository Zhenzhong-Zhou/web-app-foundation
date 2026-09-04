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
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { ApiError, api } from '../lib/api';
import type { Variant } from './products-page';

const UNITS = ['each', 'kg', 'g', 'litre', 'ml', 'case', 'box', 'pallet'];

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
  const [form, setForm] = useState({
    name: '',
    unitOfMeasure: 'each',
    weightGrams: '',
    lengthMm: '',
    widthMm: '',
    heightMm: '',
    caseQuantity: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  // Populated from the variant when the dialog opens for a new one, not in an
  // effect: an effect would fight the user's own edits on every re-render.
  if (variant && loadedFor !== variant.id) {
    setLoadedFor(variant.id);
    setForm({
      name: variant.name ?? '',
      unitOfMeasure: variant.unitOfMeasure ?? 'each',
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

  function close() {
    setError(null);
    setSubmitting(false);
    setLoadedFor(null);
    onClose();
  }

  /** Empty means "no value", not zero — the columns are nullable. */
  function numberOrNull(value: string): number | undefined {
    const trimmed = value.trim();
    return trimmed === '' ? undefined : Number(trimmed);
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!variant) return;

    setSubmitting(true);
    setError(null);

    try {
      await api(`/products/${productId}/variants/${variant.id}`, {
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
      });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
      return;
    } finally {
      setSubmitting(false);
    }

    close();
    await onSaved();
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit {variant?.sku}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="edit-variant-name"
              label="Size or variation"
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-variant-unit"
              label="Unit of measure"
              select
              required
              fullWidth
              value={form.unitOfMeasure}
              onChange={update('unitOfMeasure')}
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>

            <Typography variant="subtitle2">The item</Typography>

            <TextField
              id="edit-variant-weight"
              label="Weight (g)"
              type="number"
              fullWidth
              value={form.weightGrams}
              onChange={update('weightGrams')}
            />

            <Stack direction="row" spacing={2}>
              <TextField
                id="edit-variant-length"
                label="Length (mm)"
                type="number"
                fullWidth
                value={form.lengthMm}
                onChange={update('lengthMm')}
              />
              <TextField
                id="edit-variant-width"
                label="Width (mm)"
                type="number"
                fullWidth
                value={form.widthMm}
                onChange={update('widthMm')}
              />
              <TextField
                id="edit-variant-height"
                label="Height (mm)"
                type="number"
                fullWidth
                value={form.heightMm}
                onChange={update('heightMm')}
              />
            </Stack>

            <Typography variant="subtitle2">The case</Typography>

            <TextField
              id="edit-variant-case-quantity"
              label="Units per case"
              type="number"
              fullWidth
              value={form.caseQuantity}
              onChange={update('caseQuantity')}
              helperText="How many of this variant ship in one case."
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
