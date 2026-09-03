import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Stack,
  TextField,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { ApiError, api } from '../lib/api';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';

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
  const defaultRoleId =
    roles.find((role) => role.name === 'Viewer')?.id ?? roles[0]?.id ?? '';

  const [form, setForm] = useState(EMPTY);
  const [roleId, setRoleId] = useState(defaultRoleId);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  function close() {
    setForm(EMPTY);
    setRoleId(defaultRoleId);
    setError(null);
    onClose();
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/users', {
        method: 'POST',
        body: JSON.stringify({ ...form, roleId }),
      });

      await onCreated();
      close();
    } catch (caught) {
      // 409 for an address that already has an account, 400 for a role that
      // is not this organization's. Both come back as the server wrote them.
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={close} fullWidth maxWidth="sm">
      <form onSubmit={handleSubmit}>
        <DialogTitle>Add a member</DialogTitle>

        <DialogContent>
          <Stack spacing={2} sx={{ pt: 1 }}>
            {error && <Alert severity="error">{error}</Alert>}

            <TextField
              id="member-name"
              label="Name"
              required
              fullWidth
              value={form.name}
              onChange={update('name')}
              slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
            />

            <TextField
              id="member-email"
              label="Email"
              type="email"
              required
              fullWidth
              value={form.email}
              onChange={update('email')}
              slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
            />

            <TextField
              id="member-password"
              label="Temporary password"
              type="password"
              // Not new-password: this is not the signed-in admin's
              // credential, and prompting a manager to save it would file
              // someone else's password under the admin's account.
              autoComplete="off"
              required
              fullWidth
              value={form.password}
              onChange={update('password')}
              helperText={`At least ${PASSWORD_MIN_LENGTH} characters. Share it with them and ask them to change it.`}
              slotProps={{
                htmlInput: {
                  minLength: PASSWORD_MIN_LENGTH,
                  maxLength: PASSWORD_MAX_LENGTH,
                },
              }}
            />

            <TextField
              id="member-role"
              label="Role"
              select
              required
              fullWidth
              value={roleId}
              onChange={(event) => setRoleId(event.target.value)}
            >
              {roles.map((role) => (
                <MenuItem key={role.id} value={role.id}>
                  {role.name}
                </MenuItem>
              ))}
            </TextField>
          </Stack>
        </DialogContent>

        <DialogActions>
          <Button variant="text" onClick={close} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting}>
            {submitting ? 'Adding…' : 'Add member'}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
