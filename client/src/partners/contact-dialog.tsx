import {
  Dialog,
  DialogContent,
  DialogTitle,
  FormControlLabel,
  Stack,
  Switch,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
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
  const intl = useIntl();
  const [form, setForm] = useState({
    name: contact?.name ?? '',
    role: contact?.role ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    notes: contact?.notes ?? '',
    isPrimary: contact?.isPrimary ?? false,
  });

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onSaved();
    },
    {
      success: intl.formatMessage({
        id: 'partners.contact.saved',
        defaultMessage: 'Contact saved',
      }),
    },
  );

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
    <Dialog
      open={open}
      onClose={submitting ? undefined : close}
      fullWidth
      maxWidth="sm"
    >
      <form onSubmit={handleSubmit}>
        <DialogTitle>
          {contact
            ? intl.formatMessage({
                id: 'partners.contact.editTitle',
                defaultMessage: 'Edit contact',
              })
            : intl.formatMessage({
                id: 'partners.contact.addTitle',
                defaultMessage: 'Add a contact',
              })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="contact-name"
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: 200 } }}
            />

            <TextField
              id="contact-role"
              label={intl.formatMessage({
                id: 'partners.contact.role',
                defaultMessage: 'Role',
              })}
              fullWidth
              value={form.role}
              onChange={update('role')}
              helperText={intl.formatMessage({
                id: 'partners.contact.role.help',
                defaultMessage:
                  'In their words — Accounts payable, Warehouse manager.',
              })}
              slotProps={{ htmlInput: { maxLength: 100 } }}
            />

            <TextField
              id="contact-email"
              label={intl.formatMessage({
                id: 'auth.field.email',
                defaultMessage: 'Email',
              })}
              type="email"
              fullWidth
              value={form.email}
              onChange={update('email')}
              slotProps={{ htmlInput: { maxLength: 254 } }}
            />

            <TextField
              id="contact-phone"
              label={intl.formatMessage({
                id: 'partners.contact.phone',
                defaultMessage: 'Phone',
              })}
              fullWidth
              value={form.phone}
              onChange={update('phone')}
              // One of these two is required by the database, not by the
              // form: a warehouse contact often has only a phone, and a
              // finance inbox often has only an address.
              helperText={intl.formatMessage({
                id: 'partners.contact.phone.help',
                defaultMessage: 'An email or a phone — at least one.',
              })}
              slotProps={{ htmlInput: { maxLength: 50 } }}
            />

            <TextField
              id="contact-notes"
              label={intl.formatMessage({
                id: 'common.notes',
                defaultMessage: 'Notes',
              })}
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
              label={intl.formatMessage({
                id: 'partners.contact.isPrimary',
                defaultMessage: 'Main contact',
              })}
            />
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={
            contact
              ? intl.formatMessage({
                  id: 'common.save',
                  defaultMessage: 'Save',
                })
              : intl.formatMessage({
                  id: 'partners.contact.add',
                  defaultMessage: 'Add contact',
                })
          }
          pendingLabel={intl.formatMessage({
            id: 'common.saving',
            defaultMessage: 'Saving…',
          })}
        />
      </form>
    </Dialog>
  );
}
