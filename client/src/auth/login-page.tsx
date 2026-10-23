import {
  Alert,
  Button,
  Checkbox,
  FormControlLabel,
  Link,
  TextField,
  Typography,
} from '@mui/material';
import { type ReactNode, type SubmitEvent, useState } from 'react';
import { FormattedMessage, useIntl } from 'react-intl';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { PasswordField } from '../components/password-field';
import { api, ApiError } from '../lib/api';
import { SIGNED_OUT_REASON } from '../lib/session-keys';
import { useFailureWords } from '../lib/use-failure-words';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useAuth } from './use-auth';
import { useKeepSignedIn } from './use-keep-signed-in';
import { useRegistration } from './use-registration';

export function LoginPage() {
  const intl = useIntl();
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [registration] = useRegistration();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  // A refusal as it came, worded as the page renders (ADR-081).
  const [error, setError] = useState<unknown>(null);
  const errorWords = useFailureWords(error, authMessageFor);
  // A 401 here is only ever the one refusal, wrong email or password
  // (ADR-011), so it marks both fields: which of the two is wrong is
  // exactly what it must not say (#120).
  const [refused, setRefused] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  // Remembered by this browser: unticked once on a shared computer, it
  // starts unticked there next time (ADR-065).
  const [keepSignedIn, setKeepSignedIn, rememberKeepSignedIn] =
    useKeepSignedIn();
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
      rememberKeepSignedIn();

      // The login response carries { user }; /auth/me carries user,
      // organization and permissions. Reading through keeps one shape and one
      // parser rather than two that drift.
      await refresh();

      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
      // No setSubmitting(false): this component unmounts on navigate.
    } catch (caught) {
      setError(caught);
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
      {errorWords && (
        <Alert id="sign-in-error" severity="error">
          {errorWords}
        </Alert>
      )}
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
        slotProps={{
          htmlInput: {
            maxLength: PASSWORD_MAX_LENGTH,
            'aria-describedby': refused ? 'sign-in-error' : undefined,
          },
        }}
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

      {/* By invitation, no form to create an account: the way to learn
          how to get one instead (ADR-078). Nothing while it is read. */}
      {registration === 'open' && (
        <Link component={RouterLink} to="/register" variant="body2">
          {intl.formatMessage({
            id: 'auth.createAnAccount',
            defaultMessage: 'Create an account',
          })}
        </Link>
      )}
      {registration === 'invitation' && (
        <Typography variant="body2" color="text.secondary">
          <FormattedMessage
            id="auth.login.byInvitation"
            defaultMessage="New here? Accounts start from an invitation. <link>How to get one</link>"
            values={{
              link: (chunks: ReactNode[]) => (
                <Link component={RouterLink} to="/register">
                  {chunks}
                </Link>
              ),
            }}
          />
        </Typography>
      )}
    </AuthLayout>
  );
}
