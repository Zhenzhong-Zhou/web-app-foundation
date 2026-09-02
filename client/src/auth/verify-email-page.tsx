import { Alert, CircularProgress, Link, Typography } from '@mui/material';
import { useEffect, useRef, useState } from 'react';
import { Link as RouterLink, useSearchParams } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { looksLikeToken } from '../lib/validation';
import { AuthLayout } from './auth-layout';
import { useAuth } from './use-auth';

type Status = 'checking' | 'verified' | 'failed';

export function VerifyEmailPage() {
  const [params, setParams] = useSearchParams();
  const { session, refresh } = useAuth();

  // Read once. The effect strips the token from the URL when it finishes, so
  // reading params during render would flip this component into its
  // malformed-link state the moment the request succeeded.
  const [token] = useState(() => params.get('token'));

  const [status, setStatus] = useState<Status>('checking');
  const [message, setMessage] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    // token is frozen at mount, so this runs once regardless of what the URL
    // does afterwards. The render guard below cannot cover this: it has
    // already returned by the time effects run.
    if (!looksLikeToken(token) || attempted.current) return;
    attempted.current = true;

    void (async () => {
      try {
        await api('/auth/verify-email', {
          method: 'POST',
          body: JSON.stringify({ token }),
        });

        // emailVerified on the session is now stale. Cheap, and it clears the
        // "confirm your address" banner without a reload.
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
        // Strip the token either way: it ends up in browser history and in
        // the Referer header of any outbound request this page makes.
        setParams({}, { replace: true });
      }
    })();
  }, [token, setParams, session, refresh]);

  if (!looksLikeToken(token)) {
    return (
      <AuthLayout title="That link did not work">
        <Alert severity="error">
          The link is incomplete. Request a new one.
        </Alert>
        <Link
          component={RouterLink}
          to={session ? '/' : '/login'}
          variant="body2"
        >
          {session ? 'Go home' : 'Sign in'}
        </Link>
      </AuthLayout>
    );
  }

  if (status === 'checking') {
    return (
      <AuthLayout title="Confirming your address">
        <CircularProgress size={24} />
      </AuthLayout>
    );
  }

  if (status === 'failed') {
    return (
      <AuthLayout title="That link did not work">
        <Alert severity="error">{message}</Alert>
        {/* No retry: the token is single-use, so the same one fails
            identically. A new link is the only remedy. */}
        <Link
          component={RouterLink}
          to={session ? '/' : '/login'}
          variant="body2"
        >
          {session ? 'Go home and request a new link' : 'Sign in'}
        </Link>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout title="Address confirmed">
      <Typography>Your email address has been verified.</Typography>
      <Link
        component={RouterLink}
        to={session ? '/' : '/login'}
        variant="body2"
      >
        {session ? 'Continue' : 'Sign in'}
      </Link>
    </AuthLayout>
  );
}
