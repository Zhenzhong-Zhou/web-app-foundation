import {
  Alert,
  Button,
  CircularProgress,
  Skeleton,
  Stack,
} from '@mui/material';
import { type ComponentType, type ReactNode, Suspense } from 'react';
import { useIntl } from 'react-intl';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ForgotPasswordPage } from './auth/forgot-password-page';
import { InvitationPage } from './auth/invitation-page';
import { LoginPage } from './auth/login-page';
import { RegisterPage } from './auth/register-page';
import { ResetPasswordPage } from './auth/reset-password-page';
import { useAuth } from './auth/use-auth';
import { VerifyEmailPage } from './auth/verify-email-page';
import { NotFoundRoute } from './errors/not-found-page';
import { RevisionRefusalPage } from './errors/revision-refusal-page';
import { AppLayout } from './layout/app-layout';
import { isRevisionRefusal } from './lib/api';
import { loadingMarkShown, ScreenShown } from './lib/loading-mark';
import { useDelayedFlag } from './lib/use-delayed-flag';
import { SIGNED_IN_ROUTES } from './routes';

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
 * Delayed like every other loading state here: a chunk that arrives in 40ms
 * would otherwise flash a skeleton, which reads as slower than showing nothing.
 */
function RouteFallback() {
  const show = useDelayedFlag(true);
  return show ? <Skeleton height={240} /> : null;
}

/**
 * A split page as a route element.
 *
 * One boundary per route rather than one around AppLayout: a boundary wrapping
 * the layout suspends the layout, so the header and nav would tear down and
 * remount on every navigation to a chunk that is not loaded yet. Inside the
 * outlet, only the content swaps.
 *
 * ScreenShown sits inside the boundary, so it draws with the page and not
 * before: the loading mark stays over the rail until the first page's chunk
 * is in (ADR-082).
 */
function split(Page: ComponentType) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <ScreenShown />
      <Page />
    </Suspense>
  );
}

export default function App() {
  const intl = useIntl();
  const { loading, error, refresh } = useAuth();
  // Not while the loading mark is up (ADR-082): it already says the app is
  // on its way, through a cold start's minute too.
  const showSpinner = useDelayedFlag(loading) && !loadingMarkShown();

  if (loading) {
    return showSpinner ? (
      <Stack
        sx={{
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress />
      </Stack>
    ) : null;
  }

  /**
   * A retry rather than a dead end. Boot failure is usually transient — a cold
   * start on the API, a dropped packet — and `refresh` re-runs exactly the
   * request that failed. Without it the only way out of this screen is knowing
   * to press F5, and there is nothing in the browser for a user to clear:
   * the session is an httpOnly cookie and the client persists nothing.
   *
   * Refused for this tab's API revision, the server was reached, and says
   * why (ADR-081): a new version is ready, or being installed, which tries
   * again by itself.
   */
  if (isRevisionRefusal(error)) {
    return (
      <RevisionRefusalPage
        failure={error}
        onRetry={() => void refresh()}
        standalone
      />
    );
  }
  if (error) {
    return (
      <Stack
        spacing={2}
        sx={{
          minHeight: '100dvh',
          alignItems: 'center',
          justifyContent: 'center',
          p: 4,
        }}
      >
        <ScreenShown />
        <Alert severity="error">
          {intl.formatMessage({
            id: 'common.serverUnreachable',
            defaultMessage: 'Could not reach the server.',
          })}
        </Alert>
        <Button variant="contained" onClick={() => void refresh()}>
          {intl.formatMessage({
            id: 'common.tryAgain',
            defaultMessage: 'Try again',
          })}
        </Button>
      </Stack>
    );
  }

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
      {/* Signed in or out: whoever holds the link reads it (ADR-077). */}
      <Route path="/invitation" element={<InvitationPage />} />
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
        {SIGNED_IN_ROUTES.map(({ path, page }) => (
          <Route key={path} path={path} element={split(page)} />
        ))}
      </Route>

      {/* Outside both guards deliberately. Inside Protected, a signed-out
          user following a bad link would sign in only to land on a 404 —
          two steps to learn the link was wrong. Nothing leaks: every route
          is readable in the bundle, and access is enforced server-side. */}
      <Route path="*" element={<NotFoundRoute />} />
    </Routes>
  );
}
