import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Stack,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useRef, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { Bom } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

const EMPTY = { outputQuantity: '', notes: '' };

/**
 * Creates the header. Components are added afterwards, because the first
 * question is how big a batch is and the second is what goes in it — asking
 * both in one form means a dialog that grows a table inside itself.
 *
 * Quantity is sent as a string and never parsed here. A number would go
 * through a double before it left the browser, which is the precision loss
 * ADR-025 chose numeric to avoid.
 */
export function CreateBomDialog({
  open,
  outputVariantId,
  onClose,
  onCreated,
}: {
  open: boolean;
  outputVariantId: string;
  onClose: () => void;
  onCreated: (bomId: string) => Promise<void> | void;
}) {
  const [form, setForm] = useState(EMPTY);

  /**
   * A ref, not state. `useSubmit` captures its callback at render time, so a
   * value written by `setState` during submit is not visible to the `onDone`
   * that runs immediately afterwards — it would read the previous render's
   * null and skip the reload entirely. A ref is the same object across both.
   */
  const createdId = useRef<string | null>(null);

  const { submitting, error, reset, submit } = useSubmit(async () => {
    const bomId = createdId.current;
    close();
    if (bomId) await onCreated(bomId);
  });

  function close() {
    setForm(EMPTY);
    createdId.current = null;
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();

    void submit(async () => {
      const { bom } = await api<{ bom: Bom }>('/boms', {
        method: 'POST',
        body: JSON.stringify({
          outputVariantId,
          outputQuantity: form.outputQuantity,
          notes: form.notes || undefined,
        }),
      });

      createdId.current = bom.id;
    });
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>New recipe</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="bom-output-quantity"
              label="Makes per batch"
              required
              fullWidth
              value={form.outputQuantity}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  outputQuantity: event.target.value,
                }))
              }
              helperText="How many this recipe produces in one run — 1000, not 1."
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            <TextField
              id="bom-notes"
              label="Notes"
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  notes: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            {/* Stated because the alternative — entering per-unit amounts —
                is what people reach for, and it forces a division that
                reappears as stock drift (ADR-029). */}
            <Typography variant="caption" color="text.secondary">
              Enter batch amounts, not amounts per unit. Starts as a draft: add
              components, then promote it.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Creating…' : 'Create draft'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
