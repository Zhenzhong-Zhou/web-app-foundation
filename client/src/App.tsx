import {
  Alert,
  Button,
  CircularProgress,
  Skeleton,
  Stack,
} from '@mui/material';
import { type ComponentType, type ReactNode, Suspense } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { ForgotPasswordPage } from './auth/forgot-password-page';
import { LoginPage } from './auth/login-page';
import { RegisterPage } from './auth/register-page';
import { ResetPasswordPage } from './auth/reset-password-page';
import { useAuth } from './auth/use-auth';
import { VerifyEmailPage } from './auth/verify-email-page';
import { AppLayout } from './layout/app-layout';
import { useDelayedFlag } from './lib/use-delayed-flag';
import {
  AccountPage,
  AuditPage,
  CreateOrderPage,
  CreditNotePage,
  CreditNotePrintPage,
  InventoryPage,
  InvoicePage,
  InvoicePrintPage,
  InvoicesPage,
  LicencesPage,
  LocationsPage,
  LotSearchPage,
  LotTracePage,
  MembersPage,
  MovementsPage,
  OrderDetailPage,
  OrdersPage,
  OrganizationPage,
  PackingSlipPage,
  PartnerDetailPage,
  PartnersPage,
  ProductDetailPage,
  ProductionOrderDetailPage,
  ProductionOrdersPage,
  ProductsPage,
  SessionsPage,
  TaxCodesPage,
} from './pages';

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
 */
function split(Page: ComponentType) {
  return (
    <Suspense fallback={<RouteFallback />}>
      <Page />
    </Suspense>
  );
}

export default function App() {
  const { loading, error, refresh } = useAuth();
  const showSpinner = useDelayedFlag(loading);

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
   */
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
        <Alert severity="error">Could not reach the server.</Alert>
        <Button variant="contained" onClick={() => void refresh()}>
          Try again
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
        <Route path="/" element={<Navigate to="/products" replace />} />
        <Route path="/account" element={split(AccountPage)} />
        <Route path="/account/sessions" element={split(SessionsPage)} />
        <Route path="/members" element={split(MembersPage)} />
        <Route path="/audit" element={split(AuditPage)} />
        <Route
          path="/settings/organization"
          element={split(OrganizationPage)}
        />
        <Route path="/settings/tax-codes" element={split(TaxCodesPage)} />
        <Route path="/products" element={split(ProductsPage)} />
        <Route path="/products/:id" element={split(ProductDetailPage)} />
        <Route path="/licences" element={split(LicencesPage)} />
        <Route path="/inventory" element={split(InventoryPage)} />
        <Route path="/movements" element={split(MovementsPage)} />
        <Route path="/lots" element={split(LotSearchPage)} />
        <Route path="/lots/:id" element={split(LotTracePage)} />
        <Route path="/locations" element={split(LocationsPage)} />
        <Route path="/partners" element={split(PartnersPage)} />
        <Route path="/partners/:id" element={split(PartnerDetailPage)} />
        <Route path="/orders" element={split(OrdersPage)} />
        <Route path="/orders/new" element={split(CreateOrderPage)} />
        <Route path="/orders/:id" element={split(OrderDetailPage)} />
        <Route
          path="/orders/:id/shipments/:shipmentId/slip"
          element={split(PackingSlipPage)}
        />
        <Route path="/invoices" element={split(InvoicesPage)} />
        <Route path="/invoices/:id" element={split(InvoicePage)} />
        <Route path="/credit-notes/:id" element={split(CreditNotePage)} />
        <Route path="/invoices/:id/print" element={split(InvoicePrintPage)} />
        <Route
          path="/credit-notes/:id/print"
          element={split(CreditNotePrintPage)}
        />
        <Route path="/production" element={split(ProductionOrdersPage)} />
        <Route
          path="/production/:id"
          element={split(ProductionOrderDetailPage)}
        />
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
