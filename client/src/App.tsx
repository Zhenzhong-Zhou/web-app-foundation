import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { LoginPage } from './auth/login-page';
import { useAuth } from './auth/use-auth';
import { useDelayedFlag } from './lib/use-delayed-flag';
import { RegisterPage } from './auth/register-page.tsx';

/** Needs a session. Remembers where the caller was headed. */
function Protected({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const location = useLocation();

  if (!session) {
    // replace, or the back button bounces between guard and login.
    return (
      <Navigate
        to="/login"
        state={{ from: location.pathname + location.search }}
        replace
      />
    );
  }

  return children;
}

/**
 * Redirects away when a session already exists. Without this a signed-in user
 * can submit the login form again, rotating a session for no reason (ADR-015).
 */
function AuthOnly({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  return session ? <Navigate to="/" replace /> : children;
}

export default function App() {
  const { session, loading, error } = useAuth();
  const showSpinner = useDelayedFlag(loading);

  // The one place in the app that blocks on a request: until /auth/me answers
  // there is no correct thing to draw. Everything else renders its layout and
  // fills in.
  if (loading) return showSpinner ? <p>Loading…</p> : null;
  if (error) return <p role="alert">Could not reach the server.</p>;

  return (
    <Routes>
      <Route
        path="/login"
        element={
          <AuthOnly>
            <LoginPage />
          </AuthOnly>
        }
      />

      <Route
        path="/register"
        element={
          <AuthOnly>
            <RegisterPage />
          </AuthOnly>
        }
      />

      {/* Public by necessity, not by oversight: these are entered from a link
          in an inbox (ADR-017). Verify is normally reached *while* signed in,
          since registration signs you in and then mails you; reset is reached
          while signed out by definition. Neither may sit behind Protected. */}
      <Route path="/verify-email" element={<p>Verify — step 5.</p>} />
      <Route path="/reset-password" element={<p>Reset — step 5.</p>} />

      <Route
        path="/"
        element={
          <Protected>
            <p>
              Signed in as {session?.user.name} —{' '}
              {session?.organization?.name ?? 'no organization'}
            </p>
          </Protected>
        }
      />

      {/* Outside both guards deliberately. Inside Protected, a signed-out
          user following a bad link would sign in only to land on a 404 —
          two steps to learn the link was wrong. Nothing leaks: every route
          is readable in the bundle, and access is enforced server-side. */}
      <Route
        path="*"
        element={
          <div>
            <h1>Not found</h1>
            <p>
              <Link to="/">Go home</Link>
            </p>
          </div>
        }
      />
    </Routes>
  );
}
