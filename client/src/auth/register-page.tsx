import { Alert, Button, Link, TextField, Typography } from '@mui/material';
import { type SubmitEvent, useState } from 'react';
import { Link as RouterLink, useNavigate } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import {
  EMAIL_MAX_LENGTH,
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { useAuth } from './use-auth';

function messageFor(caught: unknown): string {
  if (!(caught instanceof ApiError)) return 'Could not reach the server.';

  if (caught.status === 429) {
    return caught.retryAfterSeconds
      ? `Too many attempts. Try again in ${caught.retryAfterSeconds} seconds.`
      : 'Too many attempts. Try again later.';
  }

  return caught.message;
}

/**
 * Registration creates user, organization, and Owner membership in one
 * transaction (ADR-004), and is the only onboarding path in V1 (ADR-006) —
 * which is why the organization name is required rather than optional.
 *
 * A duplicate address answers 409 and its message shows as-is. That reveals
 * the address exists, which is the open enumeration decision rather than
 * something to patch here. Nothing in this form should widen it — in
 * particular no availability check on blur, which turns one request into a
 * fast oracle.
 */
export function RegisterPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({
    name: '',
    organizationName: '',
    email: '',
    password: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(field: keyof typeof form) {
    return (event: { target: { value: string } }) =>
      setForm((current) => ({ ...current, [field]: event.target.value }));
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      // Registration signs the user in, so the cookie is already set. Read
      // through rather than parsing the 201 body: it carries { user } only.
      await refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <AuthLayout title="Create an account" onSubmit={handleSubmit}>
      {error && <Alert severity="error">{error}</Alert>}

      <TextField
        id="name"
        label="Your name"
        autoComplete="name"
        required
        fullWidth
        value={form.name}
        onChange={update('name')}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
      />

      <TextField
        id="organizationName"
        label="Company name"
        autoComplete="organization"
        required
        fullWidth
        value={form.organizationName}
        onChange={update('organizationName')}
        slotProps={{ htmlInput: { maxLength: NAME_MAX_LENGTH } }}
      />

      <TextField
        id="email"
        label="Email"
        type="email"
        autoComplete="username"
        required
        fullWidth
        value={form.email}
        onChange={update('email')}
        slotProps={{ htmlInput: { maxLength: EMAIL_MAX_LENGTH } }}
      />

      <TextField
        id="password"
        label="Password"
        type="password"
        // new-password, not current-password: this is what prompts a manager
        // to offer a generated one (ADR-017).
        autoComplete="new-password"
        required
        fullWidth
        value={form.password}
        onChange={update('password')}
        // Stated, never the authority — anything the browser checks is
        // bypassed by curl, and the 400 is the real control.
        helperText={`At least ${PASSWORD_MIN_LENGTH} characters.`}
        slotProps={{
          htmlInput: {
            minLength: PASSWORD_MIN_LENGTH,
            maxLength: PASSWORD_MAX_LENGTH,
          },
        }}
      />

      <Button type="submit" variant="contained" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </Button>

      <Typography variant="body2">
        Already have an account?{' '}
        <Link component={RouterLink} to="/login">
          Sign in
        </Link>
      </Typography>
    </AuthLayout>
  );
}
