import { Alert, Button, Stack, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';

import { PasswordField } from '../components/password-field';
import { api, messageFor } from '../lib/api';
import { PASSWORD_MAX_LENGTH, PASSWORD_MIN_LENGTH } from '../lib/validation';

const EMPTY = { currentPassword: '', newPassword: '', confirmPassword: '' };

/** A blank helper line, so the field does not jump when the warning appears. */
const RESERVED_LINE = ' ';

export function ChangePasswordForm() {
  const intl = useIntl();
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
        intl.formatMessage(
          {
            id: 'account.password.changed',
            defaultMessage:
              'Password changed.{count, plural, =0 {} one { # other device was signed out.} other { # other devices were signed out.}}',
          },
          { count: otherSessionsRevoked },
        ),
      );

      // Cleared on success only. A failed attempt should not make the user
      // retype the two they got right.
      setForm(EMPTY);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setSubmitting(false);
    }
  }

  const changePassword = intl.formatMessage({
    id: 'account.password.title',
    defaultMessage: 'Change password',
  });

  return (
    <Stack component="form" onSubmit={handleSubmit} spacing={2}>
      <Typography variant="h6" component="h2">
        {changePassword}
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}
      {result && <Alert severity="success">{result}</Alert>}

      {/* Required even though the caller is signed in: without it a stolen
          session converts into a permanent takeover. The session proves
          someone is using this browser; this proves someone knows the
          secret. */}
      <PasswordField
        id="currentPassword"
        label={intl.formatMessage({
          id: 'account.password.current',
          defaultMessage: 'Current password',
        })}
        autoComplete="current-password"
        required
        fullWidth
        value={form.currentPassword}
        onChange={update('currentPassword')}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      <PasswordField
        id="newPassword"
        label={intl.formatMessage({
          id: 'auth.reset.newPassword',
          defaultMessage: 'New password',
        })}
        autoComplete="new-password"
        required
        fullWidth
        value={form.newPassword}
        onChange={update('newPassword')}
        helperText={intl.formatMessage(
          {
            id: 'auth.passwordMinimum',
            defaultMessage: 'At least {count} characters.',
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

      {/* Client-side only, and worth having: a typo in a field you cannot
          read locks you out of an account you are currently inside. */}
      <PasswordField
        id="confirmPassword"
        label={intl.formatMessage({
          id: 'account.password.confirm',
          defaultMessage: 'Confirm new password',
        })}
        autoComplete="new-password"
        required
        fullWidth
        value={form.confirmPassword}
        onChange={update('confirmPassword')}
        error={mismatch}
        helperText={
          mismatch
            ? intl.formatMessage({
                id: 'account.password.mismatch',
                defaultMessage: 'These do not match.',
              })
            : RESERVED_LINE
        }
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      <Button
        type="submit"
        disabled={submitting || mismatch || form.confirmPassword.length === 0}
        sx={{ alignSelf: 'flex-start' }}
      >
        {submitting
          ? intl.formatMessage({
              id: 'account.password.changing',
              defaultMessage: 'Changing…',
            })
          : changePassword}
      </Button>
    </Stack>
  );
}
