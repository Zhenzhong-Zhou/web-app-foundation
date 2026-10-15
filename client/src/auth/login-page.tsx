import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  TextField,
  Typography,
} from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { PasswordField } from '../components/password-field';
import { api, ApiError } from '../lib/api';
import { KEEP_SIGNED_IN, SIGNED_OUT_REASON } from '../lib/session-keys';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useAuth } from './use-auth';

export function LoginPage() {
  const intl = useIntl();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  // A 401 here is only ever the one refusal, wrong email or password
  // (ADR-011), so it marks both fields: which of the two is wrong is
  // exactly what it must not say (#120).
  const [refused, setRefused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Remembered by this browser: unticked once on a shared computer, it
  // starts unticked there next time (ADR-065).
  const [keepSignedIn, setKeepSignedIn] = useState(
    () => window.localStorage.getItem(KEEP_SIGNED_IN) !== 'false',
  );
  // Signed out for inactivity: said once, then forgotten.
  const [idleMinutes] = useState(() => {
    const reason = window.sessionStorage.getItem(SIGNED_OUT_REASON);
    window.sessionStorage.removeItem(SIGNED_OUT_REASON);
    return reason ? Number(reason) : null;
  });

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setRefused(false);

    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, keepSignedIn }),
      });
      window.localStorage.setItem(KEEP_SIGNED_IN, String(keepSignedIn));

      // The login response carries { user }; /auth/me carries user,
      // organization and permissions. Reading through keeps one shape and one
      // parser rather than two that drift.
      await refresh();

      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
      // No setSubmitting(false): this component unmounts on navigate.
    } catch (caught) {
      setError(authMessageFor(caught));
      setRefused(caught instanceof ApiError && caught.status === 401);
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout
      title={intl.formatMessage({
        id: 'auth.signIn',
        defaultMessage: 'Sign in',
      })}
      onSubmit={handleSubmit}
    >
      {/* Alert renders role="alert", so a screen reader announces the failure
          without the user tabbing back to find it. */}
      {error && <Alert id="sign-in-error" severity="error">{error}</Alert>}
      {idleMinutes !== null && !error && (
        <Alert severity="info">
          {intl.formatMessage(
            {
              id: 'auth.signedOutIdle',
              defaultMessage:
                'You were signed out after {minutes, plural, one {# minute} other {# minutes}} without activity. Sign in to carry on where you were.',
            },
            { minutes: idleMinutes },
          )}
        </Alert>
      )}

      <TextField
        id="email"
        label={intl.formatMessage({
          id: 'auth.field.email',
          defaultMessage: 'Email',
        })}
        type="email"
        // ADR-017 rests on a password manager capturing credentials at
        // sign-in, and managers key off these attributes.
        autoComplete="username"
        required
        fullWidth
        // Not lowercased or trimmed: the server already handles casing, and
        // normalising in two places means fixing it in two places.
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        error={refused}
        slotProps={{
          htmlInput: {
            maxLength: EMAIL_MAX_LENGTH,
            'aria-describedby': refused ? 'sign-in-error' : undefined,
          },
        }}
      />

      <PasswordField
        id="password"
        label={intl.formatMessage({
          id: 'auth.field.password',
          defaultMessage: 'Password',
        })}
        autoComplete="current-password"
        required
        fullWidth
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        error={refused}
        describedBy={refused ? 'sign-in-error' : undefined}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      {/* Disabled in flight: a double submit revokes the session the first
          request just issued and creates another (ADR-015), leaving churn in
          the active-sessions screen that nobody caused. */}
      <FormControlLabel
        control={
          <Checkbox
            checked={keepSignedIn}
            onChange={(event) => setKeepSignedIn(event.target.checked)}
          />
        }
        label={
          <span>
            {intl.formatMessage({
              id: 'auth.keepSignedIn',
              defaultMessage: 'Keep me signed in',
            })}
            <Typography
              component="span"
              variant="body2"
              color="text.secondary"
              sx={{ display: 'block' }}
            >
              {intl.formatMessage({
                id: 'auth.keepSignedInHint',
                defaultMessage:
                  'Untick on a computer others use: you’re signed out when the browser closes, or after two hours idle.',
              })}
            </Typography>
          </span>
        }
        sx={{ alignItems: 'flex-start', '& .MuiCheckbox-root': { pt: 0.5 } }}
      />

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting
          ? intl.formatMessage({
              id: 'auth.login.signingIn',
              defaultMessage: 'Signing in…',
            })
          : intl.formatMessage({
              id: 'auth.signIn',
              defaultMessage: 'Sign in',
            })}
      </Button>

      <Link component={RouterLink} to="/forgot-password" variant="body2">
        {intl.formatMessage({
          id: 'auth.login.forgotPassword',
          defaultMessage: 'Forgot your password?',
        })}
      </Link>

      <Link component={RouterLink} to="/register" variant="body2">
        {intl.formatMessage({
          id: 'auth.createAnAccount',
          defaultMessage: 'Create an account',
        })}
      </Link>
    </AuthLayout>
  );
}
