import { Alert, Button, Link, TextField } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { EMAIL_MAX_LENGTH, PASSWORD_MAX_LENGTH } from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { authMessageFor } from './auth-message';
import { useAuth } from './use-auth';

export function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password }),
      });

      // The login response carries { user }; /auth/me carries user,
      // organization and permissions. Reading through keeps one shape and one
      // parser rather than two that drift.
      await refresh();

      const from = (location.state as { from?: string } | null)?.from ?? '/';
      navigate(from, { replace: true });
      // No setSubmitting(false): this component unmounts on navigate.
    } catch (caught) {
      setError(authMessageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Sign in" onSubmit={handleSubmit}>
      {/* Alert renders role="alert", so a screen reader announces the failure
          without the user tabbing back to find it. */}
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        id="email"
        label="Email"
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
        slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
      />

      <TextField
        id="password"
        label="Password"
        type="password"
        autoComplete="current-password"
        required
        fullWidth
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        slotProps={{ htmlInput: { maxLength: PASSWORD_MAX_LENGTH } }}
      />

      {/* Disabled in flight: a double submit revokes the session the first
          request just issued and creates another (ADR-015), leaving churn in
          the active-sessions screen that nobody caused. */}
      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </Button>

      <Link component={RouterLink} to="/forgot-password" variant="body2">
        Forgot your password?
      </Link>

      <Link component={RouterLink} to="/register" variant="body2">
        Create an account
      </Link>
    </AuthLayout>
  );
}
