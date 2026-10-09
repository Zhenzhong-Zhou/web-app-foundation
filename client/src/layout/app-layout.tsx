import CloseIcon from '@mui/icons-material/Close';
import KeyboardDoubleArrowLeft from '@mui/icons-material/KeyboardDoubleArrowLeft';
import KeyboardDoubleArrowRight from '@mui/icons-material/KeyboardDoubleArrowRight';
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
  Menu,
  MenuItem,
  Stack,
  Toolbar,
  Tooltip,
  Typography,
  useMediaQuery,
} from '@mui/material';
import { useTheme } from '@mui/material/styles';
import { useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, Outlet } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { ColorModeSelect } from '../components/color-mode-select';
import { ErrorBoundary } from '../components/error-boundary';
import { LanguageSelect } from '../components/language-select';
import { PersonAvatar } from '../components/person-avatar';
import { api } from '../lib/api';
import { EMAIL_MAX_WIDTH } from '../lib/text-limits';
import { LookupBox } from '../search/lookup-box';
import { ACCOUNT_ITEMS } from './navigation';
import { NotificationBell } from './notification-bell';
import { OrganizationMark } from './organization-mark';
import { RAIL_FOLDED_WIDTH, RAIL_WIDTH, SideNav } from './side-nav';

/**
 * Where the rail appears (ADR-055). Below it the same groups open in a
 * drawer behind the menu button, so narrowing the window moves the links
 * and never hides one.
 *
 * The rail replaced a top bar that ran out of room: seven links, the
 * organization's name and two icons measured a little over 1000px, French
 * had about 30px to spare at 1280, and the lot trace, the settings and an
 * organization's logo still needed a place.
 */
const BAR = 'lg' as const;

/** This device's choice of a folded rail. */
const FOLDED_KEY = 'nav.folded';

function storedFolded(): boolean {
  try {
    return localStorage.getItem(FOLDED_KEY) === 'true';
  } catch {
    // Storage refused (a locked-down browser): the rail starts open.
    return false;
  }
}

function rememberFolded(folded: boolean): void {
  try {
    localStorage.setItem(FOLDED_KEY, String(folded));
  } catch {
    // Not remembered on this device; it opens unfolded next time.
  }
}

/**
 * The frame every signed-in screen shares. A layout route, so the frame
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
  const theme = useTheme();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [folded, setFolded] = useState(storedFolded);

  /**
   * Only to close the drawer when the window grows past the breakpoint with
   * it open — otherwise a modal holding a copy of the rail would sit over the
   * rail itself. Which elements show is CSS (`display` below), so the first
   * paint is already right and nothing flashes while this resolves.
   */
  const wide = useMediaQuery(theme.breakpoints.up(BAR));

  const orgName =
    session?.organization?.name ??
    intl.formatMessage({
      id: 'layout.noOrganization',
      defaultMessage: 'No organization',
    });

  const toggleFolded = () => {
    rememberFolded(!folded);
    setFolded(!folded);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {/* The rail: beside the page from `lg`. The outer box runs the page's
          full height so its colour does too; the inner one stays in view,
          with its own scroll, while the page scrolls. Not on paper. */}
      <Box
        component="aside"
        className="no-print"
        sx={{
          display: { xs: 'none', [BAR]: 'block' },
          flexShrink: 0,
          width: folded ? RAIL_FOLDED_WIDTH : RAIL_WIDTH,
          bgcolor: 'rail.bg',
        }}
      >
        <Box
          sx={{
            position: 'sticky',
            top: 0,
            height: '100dvh',
            display: 'flex',
            flexDirection: 'column',
            gap: 0.5,
            overflowY: 'auto',
            overflowX: 'hidden',
            px: 1,
            py: 1.5,
          }}
        >
          <IconButton
            aria-label={
              folded
                ? intl.formatMessage({
                    id: 'layout.expandNavigation',
                    defaultMessage: 'Expand navigation',
                  })
                : intl.formatMessage({
                    id: 'layout.collapseNavigation',
                    defaultMessage: 'Collapse navigation',
                  })
            }
            aria-expanded={!folded}
            onClick={toggleFolded}
            sx={{
              alignSelf: folded ? 'center' : 'flex-end',
              color: 'rail.text',
              '&:hover': { color: 'rail.strong', bgcolor: 'rail.hover' },
            }}
          >
            {folded ? (
              <KeyboardDoubleArrowRight fontSize="small" />
            ) : (
              <KeyboardDoubleArrowLeft fontSize="small" />
            )}
          </IconButton>

          <SideNav folded={folded} />
        </Box>
      </Box>

      <Box sx={{ flex: 1, minWidth: 0 }}>
        {/* Sticky and never hidden on scroll: it holds the bell and the
            account, and a bar that comes and goes moves the page. */}
        <AppBar
          position="sticky"
          color="default"
          elevation={0}
          sx={{
            bgcolor: 'background.paper',
            borderBottom: 1,
            borderColor: 'divider',
          }}
        >
          {/* No flexWrap. A bar that wraps changes height with the window and
              drags the page with it. */}
          <Toolbar sx={{ gap: 1, minHeight: { xs: 56 } }}>
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

            {/* The organization's place: its logo when it has one (ADR-060),
                its name until then. The way home, which is what a person
                expects of the top-left corner. Truncated rather than
                wrapped: a long name is the one thing here of unknown width,
                so it is the one thing that gives. */}
            <Link
              component={RouterLink}
              to="/"
              underline="none"
              color="inherit"
              title={orgName}
              sx={{ minWidth: 0, flexShrink: 1 }}
            >
              <Box sx={{ maxWidth: { xs: '50vw', [BAR]: 320 } }}>
                <OrganizationMark name={orgName} />
              </Box>
            </Link>

            {/* The lookup (ADR-056) in the space between the organization and
                the bell: a box from md, a button that opens it below. */}
            <Box
              sx={{
                flexGrow: 1,
                display: 'flex',
                justifyContent: { xs: 'flex-end', md: 'center' },
                minWidth: 0,
              }}
            >
              <LookupBox />
            </Box>

            <NotificationBell />

            {/* The face alone (ADR-063): on a shared computer it says whose
                account this is at a glance; the name and email are on hover
                and at the top of the menu. */}
            <Tooltip
              title={[session?.user.name, session?.user.email]
                .filter(Boolean)
                .join(' · ')}
            >
              <IconButton
                edge="end"
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
                <PersonAvatar
                  userId={session?.user.id ?? null}
                  name={session?.user.name ?? null}
                  email={session?.user.email}
                  photoFileId={session?.user.photoFileId}
                  size={32}
                />
              </IconButton>
            </Tooltip>

            {/* The person's own things. The organization's settings are in
                the rail now (ADR-055); this keeps who is signed in and how
                the app reads to them. */}
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              <MenuItem disabled sx={{ opacity: '1 !important', gap: 1.5 }}>
                <PersonAvatar
                  userId={session?.user.id ?? null}
                  name={session?.user.name ?? null}
                  email={session?.user.email}
                  photoFileId={session?.user.photoFileId}
                  size={40}
                />
                {/* Cut short when long, whole on hover: the menu keeps its
                    width whatever the address (ADR-063). */}
                <Stack sx={{ minWidth: 0, maxWidth: EMAIL_MAX_WIDTH }}>
                  <Typography
                    variant="subtitle2"
                    noWrap
                    title={session?.user.name}
                  >
                    {session?.user.name}
                  </Typography>
                  <Typography
                    variant="caption"
                    color="text.secondary"
                    noWrap
                    title={session?.user.email}
                  >
                    {session?.user.email}
                  </Typography>
                </Stack>
              </MenuItem>

              <Divider />

              {ACCOUNT_ITEMS.map((item) => (
                <MenuItem
                  key={item.to}
                  component={RouterLink}
                  to={item.to}
                  onClick={() => setMenu(null)}
                >
                  {intl.formatMessage(item.label)}
                </MenuItem>
              ))}

              {/* A preference, not a destination — and not a reason to close
                  the menu, unlike everything above it. */}
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

              {/* The row is deleted server-side before the cookie is cleared,
                  so a failure leaves the user visibly signed in — the safe
                  direction to fail (ADR-011). refresh() then 401s and
                  Protected redirects. */}
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

        {/* The same groups as the rail, open, for a window too narrow for
            it. Account stays on the avatar at every width, so there is still
            exactly one place for it. */}
        <Drawer
          anchor="left"
          open={drawer && !wide}
          onClose={() => setDrawer(false)}
          slotProps={{
            paper: {
              sx: { width: RAIL_WIDTH + 48, bgcolor: 'rail.bg', px: 1, py: 1 },
            },
          }}
        >
          <Stack
            direction="row"
            sx={{ alignItems: 'center', pl: 1.5, pb: 1, gap: 1 }}
          >
            <Box sx={{ flexGrow: 1, minWidth: 0 }}>
              <OrganizationMark name={orgName} onRail />
            </Box>
            <IconButton
              aria-label={intl.formatMessage({
                id: 'layout.closeNavigation',
                defaultMessage: 'Close navigation',
              })}
              onClick={() => setDrawer(false)}
              sx={{ color: 'rail.text' }}
            >
              <CloseIcon />
            </IconButton>
          </Stack>

          <SideNav onNavigate={() => setDrawer(false)} />
        </Drawer>

        <Container maxWidth="lg" sx={{ py: { xs: 2, sm: 4 } }}>
          <Stack spacing={3}>
            <UnverifiedBanner />
            {/* Inside the page so the rail and the bar survive: a person
                whose page broke should be able to click away from it. */}
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </Stack>
        </Container>
      </Box>
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
