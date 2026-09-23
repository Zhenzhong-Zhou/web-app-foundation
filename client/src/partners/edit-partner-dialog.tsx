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
import type { Partner } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

export function EditPartnerDialog({
  partner,
  onClose,
  onSaved,
}: {
  partner: Partner | null;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: partner?.name ?? '',
    code: partner?.code ?? '',
    taxId: partner?.taxId ?? '',
    notes: partner?.notes ?? '',
    isActive: partner?.isActive ?? true,
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    { success: 'Partner saved' },
  );

  function close() {
    reset();
    onClose();
  }

  function update(field: 'name' | 'code' | 'taxId' | 'notes') {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!partner) return;

    void submit(() =>
      api(`/partners/${partner.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: form.name,
          /**
           * Emptying a field leaves the stored value alone rather than
           * clearing it: UpdatePartnerDto marks these @IsOptional() @IsString(),
           * so null is a 400 and '' would store a blank the unique index still
           * treats as a value. Clearing a code needs a DTO change, not a
           * client one — same as locations.
           */
          code: form.code || undefined,
          taxId: form.taxId || undefined,
          notes: form.notes || undefined,
          isActive: form.isActive,
        }),
      }),
    );
  }

  /**
   * Remounted per partner by the key on the caller, so the form is seeded from
   * props at mount and never needs an effect to resync.
   */
  return (
    <Dialog open={!!partner} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Edit {partner?.name}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="edit-partner-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="edit-partner-code"
              label="Code"
              fullWidth
              value={form.code}
              onChange={update('code')}
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="edit-partner-tax-id"
              label="Tax ID"
              fullWidth
              value={form.taxId}
              onChange={update('taxId')}
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="edit-partner-notes"
              label="Notes"
              fullWidth
              multiline
              minRows={3}
              value={form.notes}
              onChange={update('notes')}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
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
              // Retired rather than deleted, and there is no partners.delete
              // permission for the same reason: an order pointing at this row
              // is history that cannot be given a hole in it. Turning this off
              // keeps the partner readable everywhere it is already referenced
              // and takes it out of the order form's picker.
              label="In use"
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
