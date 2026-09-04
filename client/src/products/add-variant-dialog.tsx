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
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useSubmit } from '../lib/use-submit';
import { api } from '../lib/api';

const UNITS = ['each', 'kg', 'g', 'litre', 'ml', 'case', 'box', 'pallet'];

const EMPTY = { sku: '', name: '', unitOfMeasure: 'each' };

/**
 * The second size. This is where "variant" becomes a word the person sees,
 * because by now it describes something real — a 60ct and a 120ct of the same
 * supplement.
 *
 * No lot-tracking switch: that is set once at creation and cannot be changed
 * on a variant that may already hold stock (ADR-023). A new variant inherits
 * nothing, so it defaults to off — worth revisiting if that surprises people.
 */
export function AddVariantDialog({
  open,
  productId,
  onClose,
  onCreated,
}: {
  open: boolean;
  productId: string;
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

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    // 409 when the new SKU is taken — the client cannot know what every other
    // variant in the organization is called, so it asks and reports.
    void submit(() =>
      api(`/products/${productId}/variants`, {
        method: 'POST',
        body: JSON.stringify({
          sku: form.sku,
          name: form.name || undefined,
          unitOfMeasure: form.unitOfMeasure,
          tracksBatches,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add a variant</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="variant-sku"
              label="SKU"
              required
              fullWidth
              value={form.sku}
              onChange={(event) =>
                setForm((current) => ({ ...current, sku: event.target.value }))
              }
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="variant-name"
              label="Size or variation"
              fullWidth
              value={form.name}
              onChange={(event) =>
                setForm((current) => ({ ...current, name: event.target.value }))
              }
              helperText="120ct, Large, Blue"
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="variant-unit"
              label="Unit of measure"
              select
              required
              fullWidth
              value={form.unitOfMeasure}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  unitOfMeasure: event.target.value,
                }))
              }
              helperText="What stock is counted in."
            >
              {UNITS.map((unit) => (
                <MenuItem key={unit} value={unit}>
                  {unit}
                </MenuItem>
              ))}
            </TextField>

            <FormControlLabel
              control={
                <Switch
                  checked={tracksBatches}
                  onChange={(event) => setTracksBatches(event.target.checked)}
                />
              }
              label="Track lot numbers and expiry"
            />

            {/* Stated here because the field does not appear on any edit form:
                flipping it on a variant that already holds stock leaves every
                row violating the invariant in one direction or the other, so
                it is set once (ADR-023). */}
            <Typography variant="caption" color="text.secondary">
              Lot tracking cannot be changed later.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add variant'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
