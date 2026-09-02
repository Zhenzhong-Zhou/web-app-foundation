import { Alert, Button, Stack, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';

import { ApiError, api } from '../lib/api';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../lib/validation';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ChangePasswordForm() {
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  const mismatch =
    form.confirmPassword.length > 0 &&
    form.newPassword !== form.confirmPassword;

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setResult(null);

    try {
      const { otherSessionsRevoked } = await api<{
        otherSessionsRevoked: number;
      }>('/account/password', {
        method: 'POST',
        body: JSON.stringify({
          currentPassword: form.currentPassword,
          newPassword: form.newPassword,
        }),
      });

      // Reported rather than hidden: "two other devices were signed out" is
      // how someone notices a session they did not create.
      setResult(
        otherSessionsRevoked > 0
          ? `Password changed. ${otherSessionsRevoked} other ${
              otherSessionsRevoked === 1 ? 'device was' : 'devices were'
            } signed out.`
          : 'Password changed.',
      );

      // Cleared on success only. A failed attempt should not make the user
      // retype the two they got right.
      setForm(EMPTY);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Typography variant="h6" component="h2">
        Change password
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {result && <Alert severity="success">{result}</Alert>}

      {/* Required even though the caller is signed in: without it a stolen
          session converts into a permanent takeover. The session proves
          someone is using this browser; this proves someone knows the
          secret. */}
      <TextField
        id="currentPassword"
        label="Current password"
        type="password"
        autoComplete="current-password"
        required
        fullWidth
        value={form.currentPassword}
        onChange={update('currentPassword')}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      <TextField
        id="newPassword"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        fullWidth
        value={form.newPassword}
        onChange={update('newPassword')}
        helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        slotProps={{
          htmlInput: {
            minLength: PASSWORD_MIN_LENGTH,
            maxLength: PASSWORD_MAX_LENGTH,
          },
        }}
      />

      {/* Client-side only, and worth having: a typo in a field you cannot
          read locks you out of an account you are currently inside. */}
      <TextField
        id="confirmPassword"
        label="Confirm new password"
        type="password"
        autoComplete="new-password"
        required
        fullWidth
        value={form.confirmPassword}
        onChange={update('confirmPassword')}
        error={mismatch}
        helperText={mismatch ? 'These do not match.' : ' '}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      <Button
        type="submit"
        disabled={submitting || mismatch || form.confirmPassword.length === 0}
        sx={{ alignSelf: 'flex-start' }}
      >
        {submitting ? 'Changing…' : 'Change password'}
      </Button>
    </Stack>
  );
}
