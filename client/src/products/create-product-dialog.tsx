import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  MenuItem,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

const TYPES = [
  { value: 'good', label: 'Sellable good' },
  { value: 'material', label: 'Raw material' },
  { value: 'packaging', label: 'Packaging' },
  { value: 'sample', label: 'Sample' },
  { value: 'supply', label: 'Office supply' },
  { value: 'equipment', label: 'Equipment' },
];

const EMPTY = {
  type: 'good',
  name: '',
  description: '',
  sku: '',
  variantName: '',
};

/**
 * One form, two rows. ADR-023 requires every product to have at least one
 * variant, and this is where that meets a UI that should not mention variants
 * when there is only one — the SKU field is the variant, and the person never
 * learns the word.
 *
 * A second size is added from the product's detail page, which is where the
 * concept becomes visible because it has become real.
 */
export function CreateProductDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);
  const [tracksBatches, setTracksBatches] = useState(false);

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onCreated();
  });

  function close() {
    setForm(EMPTY);
    setTracksBatches(false);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // 409 names the SKU, so the person knows whether they meant the existing
    // item or have a collision in their own numbering.
    void submit(() =>
      api('/products', {
        method: 'POST',
        body: JSON.stringify({
          type: form.type,
          name: form.name,
          description: form.description || undefined,
          variant: {
            sku: form.sku,
            name: form.variantName || undefined,
            tracksBatches,
          },
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add a product</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="product-type"
              label="Type"
              select
              required
              fullWidth
              value={form.type}
              onChange={update('type')}
            >
              {TYPES.map((type) => (
                <MenuItem key={type.value} value={type.value}>
                  {type.label}
                </MenuItem>
              ))}
            </TextField>

            <TextField
              id="product-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="product-description"
              label="Description"
              multiline
              rows={2}
              fullWidth
              value={form.description}
              onChange={update('description')}
              slotProps={{ htmlInput: { maxLength: 2000 } }}
            />

            <TextField
              id="product-sku"
              label="SKU"
              required
              fullWidth
              value={form.sku}
              onChange={update('sku')}
              helperText="Typed, not generated — this is the code on the label."
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="variant-name"
              label="Size or variation"
              fullWidth
              value={form.variantName}
              onChange={update('variantName')}
              helperText="Optional. 60ct, Large, Blue — leave blank if there is only one."
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={tracksBatches}
                  onChange={(event) => setTracksBatches(event.target.checked)}
                />
              }
              // Cannot be changed later: flipping it on a variant with stock
              // leaves every row violating the invariant in one direction or
              // the other (ADR-023).
              label="Track lot numbers and expiry"
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add product'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
