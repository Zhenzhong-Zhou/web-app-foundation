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
import { type ReactNode, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink, Outlet, useLocation } from 'react-router-dom';

import { DeletionBanner } from '../account/deletion-banner';
import { useAuth } from '../auth/use-auth';
import { useResendConfirmation } from '../auth/use-resend-confirmation';
import { ColorModeSelect } from '../components/color-mode-select';
import { ErrorBoundary } from '../components/error-boundary';
import { LanguageSelect } from '../components/language-select';
import { PersonAvatar } from '../components/person-avatar';
import type { PreferenceControl } from '../components/preference-control';
import { TextSizeSelect } from '../components/text-size-select';
import { NameAndEmail } from '../components/who-and-when';
import { HelpButton } from '../help/help-button';
import { HelpFrame } from '../help/help-panel';
import { HelpProvider } from '../help/help-provider';
import { useHelp } from '../help/use-help';
import { api } from '../lib/api';
import { initialsOf } from '../lib/person-initials';
import { LookupBox } from '../search/lookup-box';
import { OrganizationDeletionBanner } from '../settings/organization-deletion-banner';
import { useTextSize } from '../theme/text-size';
import { IdleGuard } from './idle-guard';
import { ACCOUNT_ITEMS } from './navigation';
import { NotificationBell } from './notification-bell';
import { OrganizationMark } from './organization-mark';
import { RAIL_FOLDED_WIDTH, RAIL_WIDTH } from './rail';
import { SideNav } from './side-nav';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';
import { UnverifiedBannerContext } from './unverified-banner-context';

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

/**
 * A row of the account menu holding a preference's select, a row so the
 * menu's arrow keys reach it. The select's own focus and blur stop at the
 * row: a MUI select that loses focus while closed rewrites its blur's
 * target to { value, name }, for form libraries, and bubbling on to the
 * row's ButtonBase, that was tested for :focus-visible and failed, which
 * MUI reports as a browser without it. The row's own focus and blur, its
 * focus ring among them, are its own and unchanged; the select has its own
 * ring.
 *
 * Enter or Space on the row opens its select (#151), which the row holds
 * open or closed: the select gives focus back to where it was opened from,
 * so Escape, or a choice, returns to the row and the menu's arrow keys,
 * and the row is read again with its choice. Only a press on the row
 * itself: a click inside the select, or on one of its options, which
 * reaches the row through the portal, is the select's own.
 */
function PreferenceItem({
  children,
}: {
  children: (control: PreferenceControl) => ReactNode;
}) {
  const [open, setOpen] = useState(false);

  return (
    <MenuItem
      disableRipple
      onClick={(event) => {
        if (event.target === event.currentTarget) setOpen(true);
      }}
      sx={{ '&:hover': { bgcolor: 'transparent' } }}
    >
      <Box
        sx={{ display: 'contents' }}
        onFocus={(event) => event.stopPropagation()}
        onBlur={(event) => event.stopPropagation()}
      >
        {children({
          open,
          onOpen: () => setOpen(true),
          onClose: () => setOpen(false),
        })}
      </Box>
    </MenuItem>
  );
}

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
 *
 * Help (ADR-079) holds its state around the frame, so the bar's button, the
 * panel and a page's Learn more share it.
 */
export function AppLayout() {
  return (
    <HelpProvider>
      <Frame />
    </HelpProvider>
  );
}

function Frame() {
  const intl = useIntl();
  const location = useLocation();
  const { session, refresh } = useAuth();
  const theme = useTheme();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState(false);
  const [folded, setFolded] = useState(storedFolded);
  const help = useHelp();
  const phone = useMediaQuery(theme.breakpoints.down('sm'), { noSsr: true });
  // While Help is open on a computer, the rail folds to leave the page room
  // beside it, and opens again once Help closes, unless the person opened
  // or closed it meanwhile (ADR-079). Their own choice, remembered on this
  // device, is not touched.
  const helpOpen = !!help?.open && !phone;
  const [helpWasOpen, setHelpWasOpen] = useState(helpOpen);
  const [foldedForHelp, setFoldedForHelp] = useState(false);
  if (helpWasOpen !== helpOpen) {
    setHelpWasOpen(helpOpen);
    if (helpOpen && !folded) {
      setFolded(true);
      setFoldedForHelp(true);
    } else if (!helpOpen && foldedForHelp) {
      setFolded(false);
      setFoldedForHelp(false);
    }
  }
  // Whether the page asks to confirm the address itself (ADR-079).
  const [unverifiedCovered, setUnverifiedCovered] = useState(false);
  const bar = useRef<HTMLElement>(null);

  /**
   * Only to close the drawer when the window grows past the breakpoint with
   * it open — otherwise a modal holding a copy of the rail would sit over the
   * rail itself. Which elements show is CSS (`display` below), so the first
   * paint is already right and nothing flashes while this resolves.
   */
  const wide = useMediaQuery(theme.breakpoints.up(BAR));

  /**
   * A phone narrower than most, at Larger text (ADR-075): the name would be
   * cut to a few letters, so the logo or the initials stand alone, and the
   * bar's six targets keep their 44 px (ADR-079).
   */
  const narrow = useMediaQuery('(max-width: 359.95px)', { noSsr: true });
  const textSize = useTextSize();
  const tight = narrow && textSize === 'larger';

  const orgName =
    session?.organization?.name ??
    intl.formatMessage({
      id: 'layout.noOrganization',
      defaultMessage: 'No organization',
    });

  const toggleFolded = () => {
    rememberFolded(!folded);
    setFolded(!folded);
    setFoldedForHelp(false);
  };

  return (
    <Box sx={{ display: 'flex', minHeight: '100dvh' }}>
      {/* First, so it is the first Tab stop (#121). */}
      <SkipLink />

      {/* The rail: beside the page from `lg`. The outer box runs the page's
          full height so its colour does too; the inner one stays in view,
          with its own scroll, while the page scrolls. */}
      <Box
        component="aside"
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
          ref={bar}
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
          {/* Closer on a phone, so six targets fit at 320 px (ADR-079).
              Every target in the bar is a fingertip, 44 px each way, at
              any text size and with any pointer: the bar is the one place
              every page shares, and on a phone it is reached with a thumb
              (ADR-075). Set here, not in the theme, which sizes the rest of
              the app's controls by the pointer. */}
          <Toolbar
            sx={{
              gap: { xs: 0.5, sm: 1 },
              minHeight: { xs: 56 },
              '& > .MuiIconButton-root, & > .MuiButton-root, & > * > .MuiIconButton-root':
                { minWidth: 44, minHeight: 44 },
            }}
          >
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
              sx={[
                {
                  minWidth: 44,
                  minHeight: 44,
                  flexShrink: 1,
                  display: 'flex',
                  alignItems: 'center',
                },
                tight && { flexShrink: 0, justifyContent: 'center' },
              ]}
            >
              {/* minWidth 0, or the name would not shrink to be cut. */}
              <Box sx={{ maxWidth: { xs: '50vw', [BAR]: 320 }, minWidth: 0 }}>
                <OrganizationMark name={orgName} initials={tight} />
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
                '& .MuiInputBase-root': { minHeight: 44 },
              }}
            >
              <LookupBox />
            </Box>

            {/* Beside the bell (ADR-079), where the welcome says it is. */}
            <HelpButton />

            <NotificationBell />

            {/* The face alone (ADR-063): on a shared computer it says whose
                account this is at a glance; the name and email are on hover
                and at the top of the menu. Its name starts with the initials
                the circle shows, so a voice user can say what they see
                (WCAG 2.5.3, Label in Name). */}
            <Tooltip
              title={[session?.user.name, session?.user.email]
                .filter(Boolean)
                .join(' · ')}
            >
              <IconButton
                edge="end"
                aria-label={intl.formatMessage(
                  {
                    id: 'layout.signedInAsWithInitials',
                    defaultMessage: '{initials}, signed in as {email}',
                  },
                  {
                    initials: initialsOf(
                      session?.user.name ?? null,
                      session?.user.email,
                    ),
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
              {/* Who is signed in: not a menu item, so it takes a hover (a
                  disabled item takes none). The email is cut at the name's
                  width, whole in its tooltip (ADR-063). */}
              <Box
                component="li"
                role="none"
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 1.5,
                  px: 2,
                  py: 1.5,
                }}
              >
                <PersonAvatar
                  userId={session?.user.id ?? null}
                  name={session?.user.name ?? null}
                  email={session?.user.email}
                  photoFileId={session?.user.photoFileId}
                  size={40}
                />
                <NameAndEmail
                  name={session?.user.name ?? ''}
                  email={session?.user.email ?? null}
                  nameVariant="subtitle2"
                />
              </Box>

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
              <PreferenceItem>
                {(control) => <ColorModeSelect control={control} />}
              </PreferenceItem>
              <PreferenceItem>
                {(control) => <LanguageSelect control={control} />}
              </PreferenceItem>
              <PreferenceItem>
                {(control) => <TextSizeSelect control={control} />}
              </PreferenceItem>

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
              // The dialog's name, as its buttons name what they do to it.
              'aria-label': intl.formatMessage({
                id: 'layout.navigation',
                defaultMessage: 'Navigation',
              }),
              sx: {
                width: `calc(${RAIL_WIDTH} + 48px)`,
                bgcolor: 'rail.bg',
                px: 1,
                py: 1,
              },
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

        {/* The page's main landmark (#121), and where the skip link puts
            focus: -1 takes it by script without adding a Tab stop, and its
            outline is left off because nothing in it is pressed. Help sits
            over the right of it, or beside it (ADR-079). */}
        <HelpFrame bar={bar}>
          <Container
            component="main"
            id={MAIN_CONTENT_ID}
            tabIndex={-1}
            maxWidth="lg"
            sx={{ py: { xs: 2, sm: 4 }, '&:focus': { outline: 'none' } }}
          >
            <Stack spacing={3}>
              <UnverifiedBanner covered={unverifiedCovered} />
              <DeletionBanner />
              <OrganizationDeletionBanner />
              {/* Signs out after inactivity, warning a minute before (ADR-065). */}
              <IdleGuard />
              {/* Inside the page so the rail and the bar survive, and reset by
                the address, so a person whose page broke can click away. */}
              <UnverifiedBannerContext.Provider value={setUnverifiedCovered}>
                <ErrorBoundary resetKey={location.pathname}>
                  <Outlet />
                </ErrorBoundary>
              </UnverifiedBannerContext.Provider>
            </Stack>
          </Container>
        </HelpFrame>
      </Box>
    </Box>
  );
}

/**
 * ADR-017 chose to let an unverified user in rather than block login, on the
 * grounds that losing a registration to a dead SMTP connection would be
 * absurd. This is the other half of that decision — without a visible prompt,
 * "unverified" is a state with no way out. Off while the page asks the same
 * itself, as Home's welcome does (ADR-079).
 */
function UnverifiedBanner({ covered }: { covered: boolean }) {
  const intl = useIntl();
  const { session } = useAuth();
  const { sent, sending, resend } = useResendConfirmation();

  if (!session || session.user.emailVerified || covered) return null;

  return (
    <Alert
      severity="warning"
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
            onClick={resend}
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
