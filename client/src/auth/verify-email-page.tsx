import { useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { looksLikeToken } from '../lib/validation';
import { useAuth } from './use-auth';

type Status = 'checking' | 'verified' | 'failed';

/**
 * Public by necessity, not by oversight (ADR-020): the link arrives in an
 * inbox, and this is normally opened *while signed in* — registration signs
 * the user in and then mails them.
 *
 * The token is spent by this POST, not by loading the page, which is what
 * keeps corporate mail scanners from consuming it before the human clicks
 * (ADR-017).
 */
export function VerifyEmailPage() {
  const [params, setParams] = useSearchParams();
  const { session, refresh } = useAuth();

  // Read once. The effect strips the token from the URL when it finishes, so
  // reading params during render would flip this component into its
  // malformed-link state the moment the request succeeds.
  const [token] = useState(() => params.get('token'));

  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // token is frozen at mount, so this effect runs once regardless of what
    // the URL does afterwards. The render guard below cannot cover this: it
    // has already returned by the time effects run.
    if (!looksLikeToken(token) || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        await api('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        if (session) await refresh();
        setStatus('verified');
      } catch (caught) {
        setStatus('failed');
        setMessage(
          caught instanceof ApiError
            ? caught.message
            : 'Could not reach the server.',
        );
      } finally {
        setParams({}, { replace: true });
      }
    })();
  }, [token, setParams, session, refresh]);

  // Known at first render, so no effect and no state: a truncated link is a
  // property of the URL, not something discovered asynchronously.
  if (!looksLikeToken(token)) {
    return (
      <div>
        <h1>That link did not work</h1>
        <p role="alert">The link is incomplete. Request a new one.</p>
        <p>
          <Link to={session ? '/' : '/login'}>
            {session ? 'Go home' : 'Sign in'}
          </Link>
        </p>
      </div>
    );
  }

  if (status === 'checking') return <p>Confirming your address…</p>;

  if (status === 'failed') {
    return (
      <div>
        <h1>That link did not work</h1>
        <p role="alert">{message}</p>
        {/* No retry button: the token is single-use, so retrying the same one
            fails identically. A new link is the only remedy. */}
        <p>
          {session ? (
            <Link to="/">Go home and request a new link</Link>
          ) : (
            <Link to="/login">Sign in</Link>
          )}
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1>Address confirmed</h1>
      <p>
        <Link to={session ? '/' : '/login'}>
          {session ? 'Continue' : 'Sign in'}
        </Link>
      </p>
    </div>
  );
}
