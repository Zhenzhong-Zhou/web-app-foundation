import {
  Dialog,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { DialogFooter } from '../components/dialog-footer';
import { FormError } from '../components/form-error';
import { api } from '../lib/api';
import { useSubmit } from '../lib/use-submit';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { roleLabel } from './role-names';

interface Role {
  id: string;
  name: string;
}

const EMPTY = { name: '', email: '', password: '' };

/**
 * Admin-created membership — how a second person joins an organization in V1,
 * because ADR-006 defers invitations.
 *
 * Note what that means here: an admin chooses someone else's password and has
 * to communicate it out of band. That is a stopgap, not the intended flow. An
 * invitation would let the person set their own, and the account would never
 * have a password a second party knows.
 */
export function CreateMemberDialog({
  open,
  roles,
  onClose,
  onCreated,
}: {
  open: boolean;
  roles: Role[];
  onClose: () => void;
  onCreated: () => Promise<void>;
}) {
  // Least privilege by default. Owner is in the list because the server
  // decides who may assign it, but it should never be the resting choice.
  const intl = useIntl();
  const defaultRoleId =
    roles.find((role) => role.name === 'Viewer')?.id ?? roles[0]?.id ?? '';

  const [form, setForm] = useState(EMPTY);
  const [roleId, setRoleId] = useState(defaultRoleId);

  const { submitting, error, reset, submit } = useSubmit(
    async () => {
      close();
      await onCreated();
    },
    {
      success: intl.formatMessage({
        id: 'members.added',
        defaultMessage: 'Member added',
      }),
    },
  );

  function close() {
    setForm(EMPTY);
    setRoleId(defaultRoleId);
    reset();
    onClose();
  }

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();

    // 409 for an address that already has an account, 400 for a role that is
    // not this organization's. Both come back as the server wrote them.
    void submit(() =>
      api('/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, roleId }),
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
          {intl.formatMessage({
            id: 'members.addTitle',
            defaultMessage: 'Add a member',
          })}
        </DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <FormError message={error} />}

            <TextField
              id="member-name"
              label={intl.formatMessage({
                id: 'common.name',
                defaultMessage: 'Name',
              })}
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
            />

            <TextField
              id="member-email"
              label={intl.formatMessage({
                id: 'auth.field.email',
                defaultMessage: 'Email',
              })}
              type="email"
              required
              fullWidth
              value={form.email}
              onChange={update('email')}
              slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
            />

            <TextField
              id="member-password"
              label={intl.formatMessage({
                id: 'members.tempPassword',
                defaultMessage: 'Temporary password',
              })}
              type="password"
              // Not new-password: this is not the signed-in admin's
              // credential, and prompting a manager to save it would file
              // someone else's password under the admin's account.
              autoComplete="off"
              required
              fullWidth
              value={form.password}
              onChange={update('password')}
              helperText={intl.formatMessage(
                {
                  id: 'members.tempPassword.help',
                  defaultMessage:
                    'At least {count} characters. Share it with them and ask them to change it.',
                },
                { count: PASSWORD_MIN_LENGTH },
              )}
              slotProps={{
                htmlInput: {
                  minLength: PASSWORD_MIN_LENGTH,
                  maxLength: PASSWORD_MAX_LENGTH,
                },
              }}
            />

            <TextField
              id="member-role"
              label={intl.formatMessage({
                id: 'members.role',
                defaultMessage: 'Role',
              })}
              select
              required
              fullWidth
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {roleLabel(role.name)}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogFooter
          submitting={submitting}
          onCancel={close}
          label={intl.formatMessage({
            id: 'members.add',
            defaultMessage: 'Add member',
          })}
          pendingLabel={intl.formatMessage({
            id: 'common.adding',
            defaultMessage: 'Adding…',
          })}
        />
      </form>
    </Dialog>
  );
}
