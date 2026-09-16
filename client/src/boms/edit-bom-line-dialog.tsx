import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import type { BomLine } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * Quantity, supply type, notes.
 *
 * No component picker: changing which item a line points at is not an edit but
 * a different line, and the server refuses it for that reason. Remove and add
 * instead — both are audited, and the trail says what actually happened rather
 * than showing one line that quietly became another.
 *
 * The caller keys this on the line's id, so opening a different line remounts
 * the component and the fields initialise from props. An effect syncing state
 * to `line` would do the same thing a render later, which is both a cascading
 * render and a window in which the form shows the previous line's quantity.
 */
export function EditBomLineDialog({
  open,
  bomId,
  line,
  onClose,
  onSaved,
}: {
  open: boolean;
  bomId: string | null;
  line: BomLine | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [quantity, setQuantity] = useState(line?.quantity ?? '');
  const [notes, setNotes] = useState(line?.notes ?? '');
  const [external, setExternal] = useState(line?.supplyType === 'external');

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onSaved();
  });

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!bomId || !line) return;

    void submit(() =>
      api(`/boms/${bomId}/lines/${line.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          quantity,
          supplyType: external ? 'external' : 'stocked',
          notes: notes || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit component</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="bom-line-edit-quantity"
              label="Quantity per batch"
              required
              fullWidth
              value={quantity}
              onChange={(event) => setQuantity(event.target.value)}
              slotProps={{ htmlInput: { inputMode: 'decimal', maxLength: 19 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={external}
                  onChange={(event) => setExternal(event.target.checked)}
                />
              }
              label="The manufacturer provides this"
            />

            <TextField
              id="bom-line-edit-notes"
              label="Notes"
              fullWidth
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
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
