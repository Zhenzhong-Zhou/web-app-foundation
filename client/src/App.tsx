import { Alert, Button, CircularProgress, Stack } from '@mui/material';
import type { ReactNode } from 'react';
import { Link, Navigate, Route, Routes, useLocation } from 'react-router-dom';

import { AccountPage } from './account/account-page';
import { SessionsPage } from './account/sessions-page';
import { AuditPage } from './audit/audit-page';
import { ForgotPasswordPage } from './auth/forgot-password-page';
import { LoginPage } from './auth/login-page';
import { RegisterPage } from './auth/register-page';
import { ResetPasswordPage } from './auth/reset-password-page';
import { useAuth } from './auth/use-auth';
import { VerifyEmailPage } from './auth/verify-email-page';
import { InventoryPage } from './inventory/inventory-page';
import { AppLayout } from './layout/app-layout';
import { useDelayedFlag } from './lib/use-delayed-flag';
import { LocationsPage } from './locations/locations-page';
import { MembersPage } from './members/members-page';
import { CreateOrderPage } from './orders/create-order-page';
import { OrderDetailPage } from './orders/order-detail-page';
import { OrdersPage } from './orders/orders-page';
import { PartnerDetailPage } from './partners/partner-detail-page';
import { PartnersPage } from './partners/partners-page';
import { ProductDetailPage } from './products/product-detail-page';
import { ProductsPage } from './products/products-page';

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
  const { loading, error, refresh } = useAuth();
  const showSpinner = useDelayedFlag(loading);

  if (loading) {
    return showSpinner ? (
      <Stack sx={{ p: 8, alignItems: 'center' }}>
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
      <Stack spacing={2} sx={{ p: 4, alignItems: 'flex-start' }}>
        <Alert severity="error">Could not reach the server.</Alert>
        <Button onClick={() => void refresh()}>Try again</Button>
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
        <Route path="/account" element={<AccountPage />} />
        <Route path="/account/sessions" element={<SessionsPage />} />
        <Route path="/members" element={<MembersPage />} />
        <Route path="/audit" element={<AuditPage />} />
        <Route path="/products" element={<ProductsPage />} />
        <Route path="/products/:id" element={<ProductDetailPage />} />
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/locations" element={<LocationsPage />} />
        <Route path="/partners" element={<PartnersPage />} />
        <Route path="/partners/:id" element={<PartnerDetailPage />} />
        <Route path="/orders" element={<OrdersPage />} />
        <Route path="/orders/new" element={<CreateOrderPage />} />
        <Route path="/orders/:id" element={<OrderDetailPage />} />
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
