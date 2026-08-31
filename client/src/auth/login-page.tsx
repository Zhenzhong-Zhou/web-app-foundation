import { type SubmitEvent, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { useAuth } from './use-auth';

/**
 * The server answers identically for a wrong password and an unknown address
 * (ADR-011), so its message is rendered as-is. Any client-side branch on
 * "user not found" would hand back what login refused to.
 */
function messageFor(caught: unknown): string {
  if (!(caught instanceof ApiError)) return 'Could not reach the server.';

  if (caught.status === 429) {
    // Rate limited on email + IP with a fifteen-minute window, so "shortly" is
    // misleading. The header is the honest answer.
    return caught.retryAfterSeconds
      ? `Too many attempts. Try again in ${caught.retryAfterSeconds} seconds.`
      : 'Too many attempts. Try again later.';
  }

  return caught.message;
}

export function LoginPage() {
  const { refresh } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
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
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Sign in</h1>

      {error && <p role="alert">{error}</p>}

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        // ADR-017 rests on a password manager capturing credentials at sign-in.
        // Managers key off these attributes and the form element; without them
        // that reasoning does not hold.
        autoComplete="username"
        required
        // Not lowercased or trimmed: the server already handles casing, and
        // normalising in two places means fixing it in two places.
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />

      {/* Disabled in flight: a double submit revokes the session the first
          request just issued and creates another (ADR-015), leaving churn in
          the active-sessions screen that nobody caused. */}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Signing in…' : 'Sign in'}
      </button>
    </form>
  );
}
