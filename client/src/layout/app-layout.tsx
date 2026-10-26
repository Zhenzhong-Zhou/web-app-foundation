import CloseIcon from '@mui/icons-material/Close';
import MenuIcon from '@mui/icons-material/Menu';
import RefreshIcon from '@mui/icons-material/Refresh';
import {
  Alert,
  AppBar,
  Badge,
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
import { PoweredBy } from '../brand/powered-by';
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
import { LanguageFailureBanner } from '../i18n/language-failure';
import { api } from '../lib/api';
import { SEPARATOR } from '../lib/format';
import { initialsOf } from '../lib/person-initials';
import { LookupBox } from '../search/lookup-box';
import { OrganizationDeletionBanner } from '../settings/organization-deletion-banner';
import { rem } from '../theme/rem';
import { useTextSize } from '../theme/text-size';
import { NewVersionBanner } from '../version/new-version-banner';
import { NewVersionButton } from '../version/new-version-button';
import { reloadPage } from '../version/reload-page';
import { VersionAnnouncement } from '../version/version-announcement';
import { useNewVersion } from '../version/version-check';
import { IdleGuard } from './idle-guard';
import { ACCOUNT_ITEMS } from './navigation';
import { NotificationBell } from './notification-bell';
import { OrganizationMark } from './organization-mark';
import {
  RAIL_FOCUS_RING,
  RAIL_FOLDED_WIDTH,
  RAIL_MORE_BELOW,
  RAIL_WIDTH,
  SHORT_WINDOW,
} from './rail';
import { RailTop } from './rail-top';
import { SideNav } from './side-nav';
import { MAIN_CONTENT_ID, SkipLink } from './skip-link';
import { UnverifiedBannerContext } from './unverified-banner-context';
import { useMoreBelow } from './use-more-below';

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
  const { session, signedOut } = useAuth();
  const theme = useTheme();
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const [drawer, setDrawer] = useState(false);
  const {
    scroller: railScroller,
    content: railContent,
    more: railMore,
  } = useMoreBelow();
  const {
    scroller: drawerScroller,
    content: drawerContent,
    more: drawerMore,
  } = useMoreBelow();
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

  /**
   * A newer build, before its saves would be refused (ADR-081): "New
   * version" beside Help on a computer; on a phone, whose bar has no room
   * for a seventh target at 320 px, a dot on the account button and the
   * new version first in its menu. Neither changes the bar's height. Once
   * saves would be refused, the amber banner takes their place.
   */
  const version = useNewVersion();
  const quiet = version.newer && !version.urgent;
  const dot = quiet && phone;

  /** Who the account button names. */
  const account = {
    initials: initialsOf(session?.user.name ?? null, session?.user.email),
    email:
      session?.user.email ??
      intl.formatMessage({
        id: 'layout.unknownUser',
        defaultMessage: 'unknown',
      }),
  };

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
          full height so its colour does too; the inner one stays in view
          while the page scrolls. Its links scroll on their own above its
          foot, which is pinned, so Powered by is in view at any window
          height above about 500 px (ADR-082). */}
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
            // Too short to pin the foot: all of it scrolls, as one.
            [SHORT_WINDOW]: { overflowY: 'auto', overflowX: 'hidden' },
          }}
        >
          {/* The organization's at the top, the product's at the foot
              (ADR-082), its fade saying when more links run on under it. */}
          <Box
            ref={railScroller}
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              overflowX: 'hidden',
              [SHORT_WINDOW]: { flex: 'none', overflow: 'visible' },
            }}
          >
            <Box
              ref={railContent}
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 0.5,
                px: 1,
                pt: 1,
                pb: 1,
              }}
            >
              <RailTop name={orgName} folded={folded} onToggle={toggleFolded} />

              <SideNav folded={folded} />
            </Box>
          </Box>

          <Box
            sx={[
              { flex: 'none', position: 'relative', px: 1, pb: 1 },
              railMore && RAIL_MORE_BELOW,
            ]}
          >
            <PoweredBy folded={folded} />
          </Box>
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
          {/* A newer build's arrival, said politely, on a phone and a
              computer alike (ADR-081). */}
          <VersionAnnouncement />

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
                so it is the one thing that gives. Below the rail's width
                only: beside the rail, its top holds it (ADR-082). */}
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
                  display: { xs: 'flex', [BAR]: 'none' },
                  alignItems: 'center',
                },
                tight && { flexShrink: 0, justifyContent: 'center' },
              ]}
            >
              {/* minWidth 0, or the name would not shrink to be cut. */}
              <Box sx={{ maxWidth: '50vw', minWidth: 0 }}>
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

            {quiet && !phone && <NewVersionButton />}

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
                aria-label={
                  dot
                    ? intl.formatMessage(
                        {
                          id: 'layout.signedInAsWithNewVersion',
                          defaultMessage:
                            '{initials}, signed in as {email}, a new version is ready',
                        },
                        account,
                      )
                    : intl.formatMessage(
                        {
                          id: 'layout.signedInAsWithInitials',
                          defaultMessage: '{initials}, signed in as {email}',
                        },
                        account,
                      )
                }
                onClick={(event) => setMenu(event.currentTarget)}
              >
                <Badge
                  variant="dot"
                  color="info"
                  overlap="circular"
                  invisible={!dot}
                >
                  <PersonAvatar
                    userId={session?.user.id ?? null}
                    name={session?.user.name ?? null}
                    email={session?.user.email}
                    photoFileId={session?.user.photoFileId}
                    size={32}
                  />
                </Badge>
              </IconButton>
            </Tooltip>

            {/* The person's own things. The organization's settings are in
                the rail now (ADR-055); this keeps who is signed in and how
                the app reads to them. */}
            <Menu anchorEl={menu} open={!!menu} onClose={() => setMenu(null)}>
              {/* The phone's place for the new version: first, so it takes
                  the menu's focus as it opens (ADR-081). */}
              {dot && (
                <MenuItem
                  onClick={reloadPage}
                  sx={{
                    gap: 1.25,
                    alignItems: 'flex-start',
                    whiteSpace: 'normal',
                    maxWidth: rem(320),
                    bgcolor: 'tone.info.bg',
                    color: 'tone.info.fg',
                    '&:hover, &.Mui-focusVisible': { bgcolor: 'tone.info.bg' },
                  }}
                >
                  <RefreshIcon fontSize="small" sx={{ mt: 0.25 }} />
                  <Box>
                    <strong>
                      {intl.formatMessage({
                        id: 'version.ready',
                        defaultMessage: 'A new version is ready',
                      })}
                    </strong>
                    {SEPARATOR}
                    {intl.formatMessage({
                      id: 'version.reloadNow',
                      defaultMessage: 'Reload now',
                    })}
                    <Typography variant="body2">
                      {intl.formatMessage({
                        id: 'version.alsoLater',
                        defaultMessage:
                          'It also loads by itself when you open another page.',
                      })}
                    </Typography>
                  </Box>
                </MenuItem>
              )}
              {dot && <Divider />}

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
                  direction to fail (ADR-011). Once it is gone, Protected
                  redirects, with no read of the session: an outdated tab's
                  would be refused, though its sign-out is served (ADR-081). */}
              <MenuItem
                onClick={() => {
                  setMenu(null);
                  void api('/auth/logout', { method: 'POST' }).then(signedOut);
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
          {/* Its links scroll above its foot, pinned as the rail's is, on
              a window tall enough to spare it (ADR-082). */}
          <Box
            ref={drawerScroller}
            sx={{
              flex: '1 1 auto',
              minHeight: 0,
              overflowY: 'auto',
              // Too short to pin the foot: the drawer scrolls, foot and all.
              [SHORT_WINDOW]: { flex: 'none', overflow: 'visible' },
            }}
          >
            <Box ref={drawerContent}>
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
                  sx={{
                    color: 'rail.text',
                    '&.Mui-focusVisible': RAIL_FOCUS_RING,
                  }}
                >
                  <CloseIcon />
                </IconButton>
              </Stack>

              <SideNav onNavigate={() => setDrawer(false)} />
            </Box>
          </Box>

          {/* Ending as the rail does, its fade too (ADR-082). */}
          <Box
            sx={[
              { flex: 'none', position: 'relative', pt: 1, pb: 0.5 },
              drawerMore && RAIL_MORE_BELOW,
            ]}
          >
            <PoweredBy />
          </Box>
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
              {/* First: its saves would be refused (ADR-081). */}
              <NewVersionBanner where="page" />
              {/* The account's language, in English for now (ADR-081). */}
              <LanguageFailureBanner />
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
  const { sent, sending, error, resend } = useResendConfirmation();

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
      {/* Said, never swallowed (#190): a person told nothing waits for an
          email that was never sent. Resend stays, to ask again. */}
      {error && (
        <Typography variant="body2" sx={{ mt: 0.5, fontWeight: 600 }}>
          {error}
        </Typography>
      )}
    </Alert>
  );
}
