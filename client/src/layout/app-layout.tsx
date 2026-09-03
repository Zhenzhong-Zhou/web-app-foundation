import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Link,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ColorModeSelect } from '../components/color-mode-select';
import { api } from '../lib/api';
import { ErrorBoundary } from '../components/error-boundary.tsx';

const NAV = [
  { label: 'Members', to: '/members' },
  { label: 'Audit log', to: '/audit', permission: 'audit.view' },
  { label: 'Account', to: '/account' },
];

/**
 * The frame every signed-in screen shares. A layout route, so the header
 * renders once and children swap through <Outlet /> — and Protected wraps
 * this rather than each child, so there is one guard rather than one per
 * route.
 *
 * Deliberately not the same component as AuthLayout. Those screens are a
 * centered card on an empty page; this is chrome around content. Merging them
 * behind a prop would be one component pretending to be two.
 */
export function AppLayout() {
  const { session, refresh } = useAuth();
  const location = useLocation();

  return (
    <Box>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        variant="outlined"
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: { xs: 1, sm: 0 } }}>
          <Typography variant="h6" component="div" sx={{ mr: 2 }}>
            {session?.organization?.name ?? 'No organization'}
          </Typography>

          <Stack direction="row" spacing={2} sx={{ flexGrow: 1 }}>
            {NAV.filter(
              (item) =>
                !item.permission ||
                session?.permissions.includes(item.permission),
            ).map((item) => (
              <Link
                key={item.to}
                component={RouterLink}
                to={item.to}
                underline={
                  location.pathname.startsWith(item.to) ? 'always' : 'hover'
                }
                color="inherit"
              >
                {item.label}
              </Link>
            ))}
          </Stack>

          <ColorModeSelect />

          {/* The row is deleted server-side before the cookie is cleared, so
              a failure leaves the user visibly signed in — the safe direction
              to fail (ADR-011). refresh() then 401s and Protected redirects. */}
          <Button
            variant="text"
            onClick={() => {
              void api('/auth/logout', { method: 'POST' }).then(refresh);
            }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 4 }}>
        <Stack spacing={3}>
          <UnverifiedBanner />
          {/* Inside the Container so the header and nav survive: a person
              whose page broke should be able to click away from it. */}
          <ErrorBoundary>
            <Outlet />
          </ErrorBoundary>
        </Stack>
      </Container>
    </Box>
  );
}

/**
 * ADR-017 chose to let an unverified user in rather than block login, on the
 * grounds that losing a registration to a dead SMTP connection would be
 * absurd. This is the other half of that decision — without a visible prompt,
 * "unverified" is a state with no way out.
 */
function UnverifiedBanner() {
  const { session } = useAuth();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!session || session.user.emailVerified) return null;

  return (
    <Alert
      severity="warning"
      action={
        // 202 whether or not a message went out, so there is nothing to
        // report but that we tried.
        sent ? (
          <Typography variant="body2">Sent</Typography>
        ) : (
          <Button
            variant="text"
            size="small"
            disabled={sending}
            onClick={() => {
              setSending(true);
              void api('/auth/verify-email/resend', { method: 'POST' })
                .then(() => setSent(true))
                .finally(() => setSending(false));
            }}
          >
            Resend
          </Button>
        )
      }
    >
      Confirm your email address to secure your account.
    </Alert>
  );
}
