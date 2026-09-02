import { Alert, Button, Link, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { EMAIL_MAX_LENGTH } from '../lib/validation';
import { AuthLayout } from './auth-layout';

/**
 * Answers identically whether or not the address exists (ADR-017), so the UI
 * must too: one confirmation, and nowhere any wording like "we couldn't find
 * that email". Saying it here would hand back exactly what the server refused.
 */
export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/forgot-password', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setSent(true);
    } catch (caught) {
      // Only transport and rate-limit failures reach here; a missing account
      // is a 202 like any other.
      setError(
        caught instanceof ApiError && caught.status === 429
          ? 'Too many requests. Try again later.'
          : 'Could not reach the server.',
      );
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <AuthLayout title="Check your email">
        <Typography>
          If that address has an account, a reset link is on its way.
        </Typography>
        <Link component={RouterLink} to="/login" variant="body2">
          Back to sign in
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Reset your password" onSubmit={handleSubmit}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        fullWidth
        value={email}
        onChange={(event) => setEmail(event.target.value)}
        slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
      />

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </Button>

      <Link component={RouterLink} to="/login" variant="body2">
        Back to sign in
      </Link>
    </AuthLayout>
  );
}
