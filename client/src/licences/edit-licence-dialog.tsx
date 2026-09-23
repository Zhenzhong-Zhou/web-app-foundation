import {
  Alert,
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
import type { ProductLicence } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/**
 * The number stays editable: it is identity, not history. A typo corrected
 * here corrects every recipe pointing at this row, which is the reason a
 * licence is a table rather than a column.
 *
 * Deactivating is the nearest thing to deleting. Recipes made under it keep
 * pointing at it, so a finished lot still traces back to what it was made
 * under.
 */
export function EditLicenceDialog({
  licence,
  onClose,
  onSaved,
}: {
  licence: ProductLicence | null;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}) {
  const [form, setForm] = useState({
    number: licence?.number ?? '',
    authority: licence?.authority ?? '',
    // The stored instant is UTC midnight of the chosen day, so the first ten
    // characters are that day (ADR: formatDay).
    issuedAt: licence?.issuedAt?.slice(0, 10) ?? '',
    expiresAt: licence?.expiresAt?.slice(0, 10) ?? '',
    notes: licence?.notes ?? '',
    isActive: licence?.isActive ?? true,
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Licence saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    if (!licence) return;

    void submit(() =>
      api(`/product-licences/${licence.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          number: form.number,
          authority: form.authority,
          issuedAt: form.issuedAt || null,
          expiresAt: form.expiresAt || null,
          notes: form.notes || undefined,
          isActive: form.isActive,
        }),
      }),
    );
  }

  return (
    <Dialog open={!!licence} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Licence {licence?.number}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-licence-number"
              label="Number"
              required
              fullWidth
              value={form.number}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  number: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-licence-authority"
              label="Issued by"
              required
              fullWidth
              value={form.authority}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  authority: event.target.value,
                }))
              }
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="edit-licence-notes"
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

            <TextField
              id="edit-licence-issued"
              label="Issued"
              type="date"
              fullWidth
              value={form.issuedAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  issuedAt: event.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="The date on the notice, if you have it."
            />

            <TextField
              id="edit-licence-expires"
              label="Valid until"
              type="date"
              fullWidth
              value={form.expiresAt}
              onChange={(event) =>
                setForm((current) => ({
                  ...current,
                  expiresAt: event.target.value,
                }))
              }
              slotProps={{ inputLabel: { shrink: true } }}
              helperText="Blank for a scheme that does not expire."
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isActive}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isActive: event.target.checked,
                    }))
                  }
                />
              }
              label="Current"
            />

            {!form.isActive && (
              <Alert severity="info">
                Withdrawn licences stay on recipes that were made under them —
                only new recipes stop offering it.
              </Alert>
            )}
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close}>
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
