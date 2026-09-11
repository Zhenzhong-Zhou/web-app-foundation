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
import type { Contact } from '../lib/types';
import { useSubmit } from '../lib/use-submit';

/** One dialog for add and edit — see AddressDialog for why. */
export function ContactDialog({
  partnerId,
  contact,
  open,
  onClose,
  onSaved,
}: {
  partnerId: string;
  contact: Contact | null;
  open: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
}) {
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    notes: contact?.notes ?? '',
    isPrimary: contact?.isPrimary ?? false,
  });

  const { submitting, error, reset, submit } = useSubmit(async () => {
    close();
    await onSaved();
  });

  function close() {
    reset();
    onClose();
  }

  function update(field: 'name' | 'role' | 'email' | 'phone' | 'notes') {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    const body = {
      name: form.name,
      role: form.role || undefined,
      email: form.email || undefined,
      phone: form.phone || undefined,
      notes: form.notes || undefined,
      isPrimary: form.isPrimary,
    };

    void submit(() =>
      contact
        ? api(`/partners/${partnerId}/contacts/${contact.id}`, {
            method: 'PATCH',
            body: JSON.stringify(body),
          })
        : api(`/partners/${partnerId}/contacts`, {
            method: 'POST',
            body: JSON.stringify(body),
          }),
    );
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>{contact ? 'Edit contact' : 'Add a contact'}</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="contact-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="contact-role"
              label="Role"
              fullWidth
              value={form.role}
              onChange={update('role')}
              helperText="In their words — Accounts payable, Warehouse manager."
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="contact-email"
              label="Email"
              type="email"
              fullWidth
              value={form.email}
              onChange={update('email')}
              slotProps={{ htmlInput: { maxLength: 254 } }}
            />

            <TextField
              id="contact-phone"
              label="Phone"
              fullWidth
              value={form.phone}
              onChange={update('phone')}
              // One of these two is required by the database, not by the
              // form: a warehouse contact often has only a phone, and a
              // finance inbox often has only an address.
              helperText="An email or a phone — at least one."
              slotProps={{ htmlInput: { maxLength: 50 } }}
            />

            <TextField
              id="contact-notes"
              label="Notes"
              fullWidth
              multiline
              minRows={2}
              value={form.notes}
              onChange={update('notes')}
              slotProps={{ htmlInput: { maxLength: 1000 } }}
            />

            <FormControlLabel
              control={
                <Switch
                  checked={form.isPrimary}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      isPrimary: event.target.checked,
                    }))
                  }
                />
              }
              label="Main contact"
            />
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Saving…' : contact ? 'Save' : 'Add contact'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
