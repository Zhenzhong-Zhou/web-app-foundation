import AccountCircle from '@mui/icons-material/AccountCircle';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  IconButton,
  Link,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ColorModeSelect } from '../components/color-mode-select';
import { ErrorBoundary } from '../components/error-boundary';
import { api } from '../lib/api';

/**
 * The work, in the order it happens: what you have, what you have asked for,
 * and the three things an order is raised against.
 *
 * Admin screens are deliberately absent — see ACCOUNT_MENU. Nine flat links
 * is more than a bar carries, and the split is not alphabetical: these are
 * visited daily, those are visited when something is wrong.
 */
const NAV = [
  { label: 'Inventory', to: '/inventory', permission: 'stock.view' },
  { label: 'Movements', to: '/movements', permission: 'stock.view' },
  { label: 'Orders', to: '/orders', permission: 'orders.view' },
  { label: 'Products', to: '/products', permission: 'products.view' },
  { label: 'Partners', to: '/partners', permission: 'partners.view' },
  { label: 'Locations', to: '/locations', permission: 'locations.view' },
  { label: 'Production', to: '/production', permission: 'production.view' },
];

/** Reached occasionally, and not worth a slot in the bar. */
const ACCOUNT_MENU = [
  { label: 'Account', to: '/account' },
  { label: 'Devices', to: '/account/sessions' },
  { label: 'Members', to: '/members' },
  { label: 'Audit log', to: '/audit', permission: 'audit.view' },
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
  const [menu, setMenu] = useState<HTMLElement | null>(null);

  const visible = (item: { permission?: string }) =>
    !item.permission || session?.permissions.includes(item.permission);

  return (
    <Box>
      <AppBar
        position="static"
        color="default"
        elevation={0}
        variant="outlined"
      >
        <Toolbar sx={{ gap: 2, flexWrap: 'wrap', py: { xs: 1, sm: 0 } }}>
          {/* The organisation name is the way home, which is what a person
              expects of the thing in the top-left corner. */}
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            color="inherit"
            sx={{ mr: 2 }}
          >
            <Typography variant="h6" component="div">
              {session?.organization?.name ?? 'No organization'}
            </Typography>
          </Link>

          <Stack direction="row" spacing={2} sx={{ flexGrow: 1 }}>
            {NAV.filter(visible).map((item) => (
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

          <IconButton
            // The email rather than "Account": on a shared terminal, who you
            // are signed in as is the thing worth being able to check.
            aria-label={`Signed in as ${session?.user.email ?? 'unknown'}`}
            onClick={(event) => setMenu(event.currentTarget)}
          >
            <AccountCircle />
          </IconButton>

          <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
            <MenuItem disabled sx={{ opacity: '1 !important' }}>
              <Typography variant="caption" color="text.secondary">
                {session?.user.email}
              </Typography>
            </MenuItem>

            <Divider />

            {ACCOUNT_MENU.filter(visible).map((item) => (
              <MenuItem
                key={item.to}
                component={RouterLink}
                to={item.to}
                onClick={() => setMenu(null)}
              >
                {item.label}
              </MenuItem>
            ))}

            {/* A preference, not a destination — and not a reason to close the
                menu, unlike everything above it. */}
            <MenuItem
              disableRipple
              sx={{ '&:hover': { bgcolor: 'transparent' } }}
            >
              <ColorModeSelect />
            </MenuItem>

            <Divider />

            {/* The row is deleted server-side before the cookie is cleared, so
                a failure leaves the user visibly signed in — the safe direction
                to fail (ADR-011). refresh() then 401s and Protected
                redirects. */}
            <MenuItem
              onClick={() => {
                setMenu(null);
                void api('/auth/logout', { method: 'POST' }).then(refresh);
              }}
            >
              Sign out
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      <Container maxWidth="lg" sx={{ py: 4 }}>
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
