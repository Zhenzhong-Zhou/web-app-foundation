import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { LoginPage } from './auth/login-page';
import { useAuth } from './auth/use-auth';
import { useDelayedFlag } from './lib/use-delayed-flag';
import { RegisterPage } from './auth/register-page.tsx';
import { VerifyEmailPage } from './auth/verify-email-page.tsx';
import { ResetPasswordPage } from './auth/reset-password-page.tsx';
import { ForgotPasswordPage } from './auth/forgot-password-page.tsx';
import { api } from './lib/api.ts';
import { Button, Stack, Typography } from '@mui/material';
import { ColorModeSelect } from './components/color-mode-select.tsx';
import { AppLayout } from './layout/app-layout.tsx';
import { AccountPage } from './account/account-page.tsx';
import { SessionsPage } from './account/sessions-page.tsx';
import { MembersPage } from './members/members-page.tsx';

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

/**
 * Placeholder for the signed-in app. Step 9 replaces this with a real
 * dashboard, and sign-out moves into a nav.
 */
function Home() {
  const { session, refresh } = useAuth();

  return (
    <Stack
      direction="row"
      spacing={2}
      sx={{ flexGrow: 1, display: { xs: 'none', sm: 'flex' } }}
    >
      <Typography
        variant="h6"
        component="div"
        noWrap
        sx={{ mr: 2, maxWidth: { xs: 140, sm: 'none' } }}
      >
        {session?.organization?.name ?? 'No organization'}
      </Typography>
      `
      <ColorModeSelect />
      {/* The row is deleted server-side before the cookie is cleared, so a
          failure leaves the user visibly signed in — the safe direction to
          fail (ADR-011). refresh() then 401s and Protected redirects. */}
      <Button
        variant="outlined"
        onClick={() => {
          void api('/auth/logout', { method: 'POST' }).then(refresh);
        }}
      >
        Sign out
      </Button>
    </Stack>
  );
}

export default function App() {
  const { loading, error } = useAuth();
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
      <Route path="/verify-email" element={<VerifyEmailPage />} />
      <Route path="/reset-password" element={<ResetPasswordPage />} />

      <Route
        path="/forgot-password"
        element={
          <AuthOnly>
            <ForgotPasswordPage />
          </AuthOnly>
        }
      />

      {/* Protected wraps the layout, not each child: one guard, and the
          header does not re-mount on navigation. */}
      <Route
        element={
          <Protected>
            <AppLayout />
          </Protected>
        }
      >
        <Route path="/" element={<Home />} />
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/sessions" element={<SessionsPage />} />
        <Route path="/members" element={<MembersPage />} />
      </Route>

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
