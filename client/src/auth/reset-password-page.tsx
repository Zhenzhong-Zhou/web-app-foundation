import { type SubmitEvent, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import {
  looksLikeToken,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../lib/validation';
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

  if (!looksLikeToken(token)) {
    return (
      <div>
        <h1>That link did not work</h1>
        <p role="alert">The link is incomplete or has expired.</p>
        <p>
          <Link to="/forgot-password">Request a new one</Link>
        </p>
      </div>
    );
  }

  async function handleSubmit(event: SubmitEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({ token, password }),
      });

      // Reset revokes every session (ADR-017), so any cookie this browser
      // still holds is now dead. Without this the app would believe it is
      // signed in and 401 on the next request it makes.
      await refresh();

      // No session is issued in exchange, deliberately: signing in with the
      // password just chosen is the moment a manager reliably captures it.
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

  return (
    <form onSubmit={handleSubmit}>
      <h1>Choose a new password</h1>

      {error && <p role="alert">{error}</p>}

      <label htmlFor="password">New password</label>
      <input
        id="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        maxLength={PASSWORD_MAX_LENGTH}
        value={password}
        onChange={(event) => setPassword(event.target.value)}
      />
      <p>At least {PASSWORD_MIN_LENGTH} characters.</p>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}
