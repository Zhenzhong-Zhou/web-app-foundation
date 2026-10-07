import AccountCircle from '@mui/icons-material/AccountCircle';
import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import {
  Alert,
  AppBar,
  Box,
  Button,
  Container,
  Divider,
  Drawer,
  IconButton,
  Link,
  List,
  ListItemButton,
  ListItemText,
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { defineMessages, type MessageDescriptor, useIntl } from 'react-intl';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

import { type Permission, useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { ColorModeSelect } from '../components/color-mode-select';
import { ErrorBoundary } from '../components/error-boundary';
import { LanguageSelect } from '../components/language-select';
import { api } from '../lib/api';
import { NotificationBell } from './notification-bell';

interface NavItem {
  label: MessageDescriptor;
  to: string;
  /** Hidden from anyone without it. The server's guard is the real check. */
  permission?: Permission;
}

const labels = defineMessages({
  inventory: { id: 'layout.nav.inventory', defaultMessage: 'Inventory' },
  movements: { id: 'layout.nav.movements', defaultMessage: 'Movements' },
  orders: { id: 'layout.nav.orders', defaultMessage: 'Orders' },
  invoices: { id: 'layout.nav.invoices', defaultMessage: 'Invoices' },
  returns: { id: 'layout.nav.returns', defaultMessage: 'Returns' },
  products: { id: 'layout.nav.products', defaultMessage: 'Products' },
  partners: { id: 'layout.nav.partners', defaultMessage: 'Partners' },
  locations: { id: 'layout.nav.locations', defaultMessage: 'Locations' },
  production: { id: 'layout.nav.production', defaultMessage: 'Production' },
  account: { id: 'layout.menu.account', defaultMessage: 'Account' },
  devices: { id: 'layout.menu.devices', defaultMessage: 'Devices' },
  members: { id: 'layout.menu.members', defaultMessage: 'Members' },
  organization: {
    id: 'layout.menu.organization',
    defaultMessage: 'Organization',
  },
  taxCodes: { id: 'layout.menu.taxCodes', defaultMessage: 'Tax codes' },
  exchangeRates: {
    id: 'layout.menu.exchangeRates',
    defaultMessage: 'Exchange rates',
  },
  priceLists: { id: 'layout.menu.priceLists', defaultMessage: 'Price lists' },
  stockValue: { id: 'layout.menu.stockValue', defaultMessage: 'Stock value' },
  auditLog: { id: 'layout.menu.auditLog', defaultMessage: 'Audit log' },
});

/**
 * The work, in the order it happens: what you have, what you have asked for,
 * and the three things an order is raised against.
 *
 * Admin screens are deliberately absent — see ACCOUNT_MENU. Nine flat links
 * is more than a bar carries, and the split is not alphabetical: these are
 * visited daily, those are visited when something is wrong.
 */
const NAV: NavItem[] = [
  { label: labels.inventory, to: '/inventory', permission: 'stock.view' },
  { label: labels.movements, to: '/movements', permission: 'stock.view' },
  { label: labels.orders, to: '/orders', permission: 'orders.view' },
  { label: labels.invoices, to: '/invoices', permission: 'invoices.view' },
  {
    label: labels.returns,
    to: '/return-authorizations',
    permission: 'return_authorizations.view',
  },
  { label: labels.products, to: '/products', permission: 'products.view' },
  { label: labels.partners, to: '/partners', permission: 'partners.view' },
  { label: labels.locations, to: '/locations', permission: 'locations.view' },
  {
    label: labels.production,
    to: '/production',
    permission: 'production.view',
  },
];

/** Reached occasionally, and not worth a slot in the bar. */
const ACCOUNT_MENU: NavItem[] = [
  { label: labels.account, to: '/account' },
  { label: labels.devices, to: '/account/sessions' },
  { label: labels.members, to: '/members' },
  {
    label: labels.organization,
    to: '/settings/organization',
    permission: 'organizations.view',
  },
  {
    label: labels.taxCodes,
    to: '/settings/tax-codes',
    permission: 'tax_codes.view',
  },
  {
    label: labels.exchangeRates,
    to: '/settings/exchange-rates',
    permission: 'costs.view',
  },
  {
    label: labels.priceLists,
    to: '/settings/price-lists',
    permission: 'price_lists.view',
  },
  { label: labels.stockValue, to: '/costs', permission: 'costs.view' },
  { label: labels.auditLog, to: '/audit', permission: 'audit.view' },
];

/**
 * Where the bar stops fitting on one line. Seven links, the organisation name
 * and two icons measure a little over 1000px; below `lg` (1200) the old bar
 * wrapped onto a second row and every page below it jumped as the window
 * resized. A single breakpoint where the links move into a drawer replaces
 * that with two stable layouts.
 */
const BAR = 'lg' as const;

/**
 * Exact or a child path, not a bare prefix: "/products".startsWith would also
 * light up a future "/products-archive", and a highlighted wrong tab is worse
 * than none.
 */
function isActive(pathname: string, to: string): boolean {
  return pathname === to || pathname.startsWith(`${to}/`);
}

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
  const intl = useIntl();
  const { session, refresh } = useAuth();
  const can = useCan();
  const location = useLocation();
  const theme = useTheme();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState(false);

  /**
   * Only to close the drawer when the window grows past the breakpoint with
   * it open — otherwise a modal holding a copy of the bar would sit over the
   * bar itself. Which elements show is CSS (`display` below), so the first
   * paint is already right and nothing flashes while this resolves.
   */
  const wide = useMediaQuery(theme.breakpoints.up(BAR));

  const visible = (item: NavItem) => !item.permission || can(item.permission);

  const links = NAV.filter(visible);
  const orgName =
    session?.organization?.name ??
    intl.formatMessage({
      id: 'layout.noOrganization',
      defaultMessage: 'No organization',
    });
  const mainNav = intl.formatMessage({
    id: 'layout.mainNavigation',
    defaultMessage: 'Main',
  });

  return (
    <Box>
      {/* Sticky: on a long inventory list the way to another section should
          not be a scroll to the top. */}
      <AppBar
        position="sticky"
        color="default"
        elevation={0}
        sx={{
          bgcolor: 'background.default',
          borderBottom: 1,
          borderColor: 'divider',
        }}
      >
        {/* No flexWrap. A bar that wraps changes height with the window and
            drags the page with it — the jump this layout exists to stop. */}
        <Toolbar sx={{ gap: 1 }}>
          <IconButton
            edge="start"
            aria-label={intl.formatMessage({
              id: 'layout.openNavigation',
              defaultMessage: 'Open navigation',
            })}
            onClick={() => setDrawer(true)}
            sx={{ display: { xs: 'inline-flex', [BAR]: 'none' } }}
          >
            <MenuIcon />
          </IconButton>

          {/* The organisation name is the way home, which is what a person
              expects of the thing in the top-left corner. Truncated rather
              than wrapped: a long name is the one thing here of unknown
              width, so it is the one thing that gives. */}
          <Link
            component={RouterLink}
            to="/"
            underline="none"
            color="inherit"
            title={orgName}
            sx={{ minWidth: 0, flexShrink: 1, mr: { [BAR]: 2 } }}
          >
            <Typography
              variant="h6"
              component="div"
              noWrap
              sx={{ maxWidth: { xs: '50vw', [BAR]: 260 } }}
            >
              {orgName}
            </Typography>
          </Link>

          <Box
            component="nav"
            aria-label={mainNav}
            sx={{
              display: { xs: 'none', [BAR]: 'flex' },
              gap: 0.5,
              flexGrow: 1,
            }}
          >
            {links.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                label={intl.formatMessage(item.label)}
                active={isActive(location.pathname, item.to)}
              />
            ))}
          </Box>

          {/* Pushes the icons right when the links are in the drawer. */}
          <Box sx={{ flexGrow: 1, display: { [BAR]: 'none' } }} />

          <NotificationBell />

          <IconButton
            edge="end"
            // The email rather than "Account": on a shared terminal, who you
            // are signed in as is the thing worth being able to check.
            aria-label={intl.formatMessage(
              {
                id: 'layout.signedInAs',
                defaultMessage: 'Signed in as {email}',
              },
              {
                email:
                  session?.user.email ??
                  intl.formatMessage({
                    id: 'layout.unknownUser',
                    defaultMessage: 'unknown',
                  }),
              },
            )}
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
                {intl.formatMessage(item.label)}
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
            <MenuItem
              disableRipple
              sx={{ '&:hover': { bgcolor: 'transparent' } }}
            >
              <LanguageSelect />
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
              {intl.formatMessage({
                id: 'layout.signOut',
                defaultMessage: 'Sign out',
              })}
            </MenuItem>
          </Menu>
        </Toolbar>
      </AppBar>

      {/* The same destinations as the bar, not a different set: narrowing the
          window should move the links, never hide one. Account stays on the
          avatar at every width, so there is still exactly one place for it. */}
      <Drawer
        anchor="left"
        open={drawer && !wide}
        onClose={() => setDrawer(false)}
        slotProps={{ paper: { sx: { width: 280 } } }}
      >
        <Stack direction="row" sx={{ alignItems: 'center', px: 2, py: 1.5 }}>
          <Typography variant="subtitle1" noWrap sx={{ flexGrow: 1 }}>
            {orgName}
          </Typography>
          <IconButton
            aria-label={intl.formatMessage({
              id: 'layout.closeNavigation',
              defaultMessage: 'Close navigation',
            })}
            onClick={() => setDrawer(false)}
          >
            <CloseIcon />
          </IconButton>
        </Stack>

        <Divider />

        <List component="nav" aria-label={mainNav} sx={{ px: 1 }}>
          {links.map((item) => {
            const active = isActive(location.pathname, item.to);

            return (
              <ListItemButton
                key={item.to}
                component={RouterLink}
                to={item.to}
                selected={active}
                aria-current={active ? 'page' : undefined}
                onClick={() => setDrawer(false)}
                sx={{ borderRadius: 1, mb: 0.5 }}
              >
                <ListItemText primary={intl.formatMessage(item.label)} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>

      <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
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
 * A pill rather than an underline. The underline moved the text's visual
 * weight when it appeared, and on a dark bar it was the only cue — a filled
 * background is readable at a glance in both modes and matches the drawer's
 * selected row, so the current section looks the same at every width.
 */
function NavLink({
  to,
  label,
  active,
}: {
  to: string;
  label: string;
  active: boolean;
}) {
  return (
    <Link
      component={RouterLink}
      to={to}
      underline="none"
      aria-current={active ? 'page' : undefined}
      sx={{
        px: 1.5,
        py: 0.75,
        borderRadius: 1,
        typography: 'body2',
        fontWeight: 500,
        whiteSpace: 'nowrap',
        color: active ? 'text.primary' : 'text.secondary',
        bgcolor: active ? 'action.selected' : 'transparent',
        transition: 'background-color 120ms, color 120ms',
        '&:hover': { color: 'text.primary', bgcolor: 'action.hover' },
        '&:focus-visible': {
          outline: '2px solid',
          outlineColor: 'primary.main',
          outlineOffset: 2,
        },
      }}
    >
      {label}
    </Link>
  );
}

/**
 * ADR-017 chose to let an unverified user in rather than block login, on the
 * grounds that losing a registration to a dead SMTP connection would be
 * absurd. This is the other half of that decision — without a visible prompt,
 * "unverified" is a state with no way out.
 */
function UnverifiedBanner() {
  const intl = useIntl();
  const { session } = useAuth();
  const [sent, setSent] = useState(false);
  const [sending, setSending] = useState(false);

  if (!session || session.user.emailVerified) return null;

  return (
    <Alert
      severity="warning"
      // Screen only: on a printed invoice it read as part of the document.
      className="no-print"
      action={
        // 202 whether or not a message went out, so there is nothing to
        // report but that we tried.
        sent ? (
          <Typography variant="body2">
            {intl.formatMessage({
              id: 'layout.unverified.sent',
              defaultMessage: 'Sent',
            })}
          </Typography>
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
            {intl.formatMessage({
              id: 'layout.unverified.resend',
              defaultMessage: 'Resend',
            })}
          </Button>
        )
      }
    >
      {intl.formatMessage({
        id: 'layout.unverified.message',
        defaultMessage: 'Confirm your email address to secure your account.',
      })}
    </Alert>
  );
}
