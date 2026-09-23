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
import { type SubmitEvent, useState } from 'react';

import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';

const EMPTY = { name: '', code: '', taxId: '', notes: '' };

export function CreatePartnerDialog({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  const [form, setForm] = useState(EMPTY);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCreated();
    },
    { success: 'Partner added' },
  );

  function close() {
    setForm(EMPTY);
    reset();
    onClose();
  }

  function update(field: keyof typeof EMPTY) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    void submit(() =>
      api('/partners', {
        method: 'POST',
        body: JSON.stringify({
          name: form.name,
          // undefined rather than '': the columns are nullable and the DTO
          // treats the field as absent, so an untouched field stores null
          // instead of an empty string nothing will ever match on.
          code: form.code || undefined,
          taxId: form.taxId || undefined,
          notes: form.notes || undefined,
        }),
      }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add a partner</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="partner-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              helperText="Names are not unique — two branches of one company are two partners."
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="partner-code"
              label="Code"
              fullWidth
              value={form.code}
              onChange={update('code')}
              helperText="Your own reference — a supplier number, a customer code. Unique within your organization if you use one."
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="partner-tax-id"
              label="Tax ID"
              fullWidth
              value={form.taxId}
              onChange={update('taxId')}
              helperText="VAT, GST, EIN — whatever applies. Stored as typed, never validated."
              slotProps={{ htmlInput: { maxLength: 64 } }}
            />

            <TextField
              id="partner-notes"
              label="Notes"
              fullWidth
              multiline
              minRows={3}
              value={form.notes}
              onChange={update('notes')}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <Typography variant="caption" color="text.secondary">
              One list for both sides of the trade. There is nothing to pick
              here — whether this partner is a supplier or a customer follows
              from the orders you raise against them.
            </Typography>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add partner'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
