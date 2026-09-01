import { type SubmitEvent, useState } from 'react';
import { Link } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { EMAIL_MAX_LENGTH } from '../lib/validation';

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
      <div>
        <h1>Check your email</h1>
        <p>If that address has an account, a reset link is on its way.</p>
        <p>
          <Link to="/login">Back to sign in</Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Reset your password</h1>

      {error && <p role="alert">{error}</p>}

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        maxLength={EMAIL_MAX_LENGTH}
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />

      <button type="submit" disabled={submitting}>
        {submitting ? 'Sending…' : 'Send reset link'}
      </button>

      <p>
        <Link to="/login">Back to sign in</Link>
      </p>
    </form>
  );
}
