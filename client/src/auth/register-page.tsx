import { type SubmitEvent, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { useAuth } from './use-auth';

/** Matches the server's rule: length only, 12 minimum, no composition rules. */
const PASSWORD_MIN_LENGTH = 12;

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
 * transaction (ADR-004), and is the only onboarding path in V1 (ADR-006).
 *
 * A duplicate address answers 409 and its message is shown as-is. That tells
 * an unauthenticated caller the address exists, which is the enumeration hole
 * login and forgot-password both avoid — it is a known open decision, and
 * closing it means changing the server's response shape. Nothing here should
 * widen it: no availability check on blur, which would turn one request into
 * a fast oracle.
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

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      await api('/auth/register', {
        method: 'POST',
        body: JSON.stringify(form),
      });

      // Registration signs the user in, so the cookie is already set. Read
      // through rather than parsing the 201 body: it carries { user } only,
      // and /auth/me is the one shape the app knows how to hold.
      await refresh();
      navigate('/', { replace: true });
    } catch (caught) {
      setError(messageFor(caught));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit}>
      <h1>Create an account</h1>

      {error && <p role="alert">{error}</p>}

      <label htmlFor="name">Your name</label>
      <input
        id="name"
        autoComplete="name"
        required
        value={form.name}
        onChange={update('name')}
      />

      <label htmlFor="organizationName">Organization name</label>
      <input
        id="organizationName"
        autoComplete="organization"
        required
        value={form.organizationName}
        onChange={update('organizationName')}
      />

      <label htmlFor="email">Email</label>
      <input
        id="email"
        type="email"
        autoComplete="username"
        required
        value={form.email}
        onChange={update('email')}
      />

      <label htmlFor="password">Password</label>
      <input
        id="password"
        type="password"
        // new-password, not current-password: this is what prompts a manager
        // to offer a generated one (ADR-017).
        autoComplete="new-password"
        required
        minLength={PASSWORD_MIN_LENGTH}
        value={form.password}
        onChange={update('password')}
      />
      {/* Stated, not enforced by a meter. The server is the only authority —
          anything the browser checks is bypassed by curl. */}
      <p>At least {PASSWORD_MIN_LENGTH} characters.</p>

      <button type="submit" disabled={submitting}>
        {submitting ? 'Creating account…' : 'Create account'}
      </button>

      <p>
        Already have an account? <Link to="/login">Sign in</Link>
      </p>
    </form>
  );
}
