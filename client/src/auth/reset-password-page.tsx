import { Alert, Button, Link, TextField } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import {
  Link as RouterLink,
  useNavigate,
  useSearchParams,
} from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import {
  looksLikeToken,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { useAuth } from './use-auth';

/**
 * Public by necessity (ADR-020): opened while signed out by definition — the
 * user is here because they lost access.
 *
 * Unlike verification, the token is spent on submit rather than on mount, so
 * there is no StrictMode hazard: nothing fires until a person clicks.
 */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const token = params.get('token');

  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      // The reset revoked every session (ADR-017), so any cookie this browser
      // still holds is dead. Without this the app would believe it is signed
      // in and 401 on the next request it makes.
      await refresh();

      // No session is issued in exchange, deliberately: signing in with the
      // password just chosen is when a manager reliably captures it.
      navigate('/login', { replace: true });
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
      setSubmitting(false);
    }
  }

  if (!looksLikeToken(token)) {
    return (
      <AuthLayout title="That link did not work">
        <Alert severity="error">The link is incomplete or has expired.</Alert>
        <Link component={RouterLink} to="/forgot-password" variant="body2">
          Request a new one
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Choose a new password" onSubmit={handleSubmit}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        id="password"
        label="New password"
        type="password"
        autoComplete="new-password"
        required
        fullWidth
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        slotProps={{
          htmlInput: {
            minLength: PASSWORD_MIN_LENGTH,
            maxLength: PASSWORD_MAX_LENGTH,
          },
        }}
      />

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting ? 'Saving…' : 'Set new password'}
      </Button>
    </AuthLayout>
  );
}
