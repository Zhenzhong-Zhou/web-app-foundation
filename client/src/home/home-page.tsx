import AccountTreeOutlined from '@mui/icons-material/AccountTreeOutlined';
import AddIcon from '@mui/icons-material/Add';
import CalendarTodayOutlined from '@mui/icons-material/CalendarTodayOutlined';
import CheckCircleOutlineOutlined from '@mui/icons-material/CheckCircleOutlineOutlined';
import ChevronRight from '@mui/icons-material/ChevronRight';
import ErrorOutlineOutlined from '@mui/icons-material/ErrorOutlineOutlined';
import MoveToInboxOutlined from '@mui/icons-material/MoveToInboxOutlined';
import PrecisionManufacturingOutlined from '@mui/icons-material/PrecisionManufacturingOutlined';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  Alert,
  Box,
  Button,
  ButtonBase,
  IconButton,
  Link,
  Paper,
  Skeleton,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import {
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { defineMessages, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { WhomToAsk, WhomToAskRead } from '../account/whom-to-ask';
import type { HomeResponse } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { StatusChip } from '../components/status-chip';
import { UndoSnackbar } from '../components/undo-snackbar';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { useCoverUnverifiedBanner } from '../layout/use-cover-unverified-banner';
import { api, isRevisionRefusal } from '../lib/api';
import { OFFER_BACK } from '../lib/offer-back';
import { differsFromBrowser, organizationTimeZone } from '../lib/time-zone';
import { zoneLabel } from '../lib/time-zone-label';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useFailureWords } from '../lib/use-failure-words';
import { HOVER } from '../theme/media';
import { rem } from '../theme/rem';
import { RADIUS } from '../theme/tokens';
import { evenRowsSx } from './even-rows';
import { GettingStarted } from './getting-started';
import { greeting } from './greeting';
import { CARDS, isKnownCard, type KnownCard } from './home-cards';
import { MainAction, type QuickAction } from './main-action';
import { NoOrganization } from './no-organization';
import { RecentCard } from './recent-card';
import { useMinute } from './use-minute';
import { useReadOnReturn } from './use-read-on-return';
import { WelcomeCard } from './welcome-card';

/** Back in view after this long away, Home reads its counts again. */
const READ_AGAIN_AWAY_MS = 60_000;

/** Placeholders while Home loads: the tiles' size, two rows of three. */
const PLACEHOLDERS = 6;

/** A tile's height, its icon, count, name and pill (ADR-091). */
const TILE_HEIGHT = 148;

/**
 * Home (ADR-058; ADR-091): a few large tiles, each opening its list. From
 * the top: the greeting with Refresh, the date and the time, and the
 * organization's What we do, the main action at the right of them from
 * `md` and under them below it, or a line saying whom to ask; a
 * newcomer's welcome (ADR-079), and Getting started while it shows, first
 * while someone is setting up, as the boards draw them (ADR-091's review);
 * what is late, a button per kind opening just the late ones; the tiles
 * under "What needs you today"; and Recently opened.
 *
 * Read when the page opens, with Refresh, and again when its tab comes
 * back into view after a minute away; not live.
 */
export function HomePage() {
  const { session } = useAuth();
  // An account in no organization, having left one or seen it closed:
  // what it can do, not the cards' refusal (ADR-078).
  return session?.organization ? <OrganizationHome /> : <NoOrganization />;
}

/** Home for a member of the session's organization. */
function OrganizationHome() {
  const intl = useIntl();
  const { session } = useAuth();
  const can = useCan();
  const [home, setHome] = useState<HomeResponse | null>(null);
  // A read's failure as it came, worded as the page renders (ADR-081), or
  // the page's own words.
  const [error, setError] = useState<unknown>(null);
  const errorWords = useFailureWords(error);
  // Only for a read that takes a while (conventions, Loading states).
  const showSkeleton = useDelayedFlag(!home);
  // The welcome just dismissed, a moment to undo it (ADR-079).
  const [undoing, setUndoing] = useState(false);
  const dismissing = useRef<Promise<unknown> | null>(null);
  // Undo's button goes with its message, so focus goes to the card it
  // brought back, once it is there.
  const welcomeHeading = useRef<HTMLHeadingElement>(null);
  const undone = useRef(false);
  // A dismissed card takes its Dismiss with it: focus goes to the page's
  // heading, where the page begins, rather than to nowhere.
  const heading = useRef<HTMLHeadingElement>(null);
  const zone = organizationTimeZone();
  const now = useMinute();

  // The server counts the tiles from the same day itself.
  const load = useCallback(() => {
    api<HomeResponse>('/home')
      .then((response) => {
        setHome(response);
        setError(null);
      })
      .catch((caught: unknown) => {
        setError(caught);
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);
  useReadOnReturn(load, READ_AGAIN_AWAY_MS);

  async function act(path: string, method: 'POST' | 'DELETE') {
    await api(path, { method }).catch(() => undefined);
    load();
  }

  /** Gone at once, with Undo; a failed write brings it back. */
  function dismissWelcome() {
    heading.current?.focus();
    setHome((current) => current && { ...current, welcome: null });
    setUndoing(true);
    dismissing.current = api('/home/welcome/dismiss', { method: 'POST' }).catch(
      load,
    );
  }

  async function undoWelcome() {
    setUndoing(false);
    undone.current = true;
    // After the dismissal has landed, so the two cannot cross.
    await dismissing.current;
    await act('/home/welcome/dismiss', 'DELETE');
  }

  const welcome = home?.welcome ?? null;
  useEffect(() => {
    if (!welcome || !undone.current) return;
    undone.current = false;
    welcomeHeading.current?.focus();
  }, [welcome]);
  // The banner asking the same is not shown here while the card lists it,
  // nor while Home is still loading the card that may (ADR-079). Someone
  // confirmed has no banner to cover, and the frame no change to render.
  useCoverUnverifiedBanner(
    !session?.user.emailVerified &&
      (home
        ? !!welcome?.items.some(
            (item) => item.key === 'confirmEmail' && !item.done,
          )
        : !error),
  );

  // Only the tiles this build knows: a newer server's kind is skipped,
  // never a crash, and what is late counts only what this build knows.
  // A tile the person hid is not drawn, but buries nothing: its late
  // items stay in the panel (ADR-091, amended November 2026).
  const cards = (home?.cards ?? []).filter(isKnownCard);
  const tiles = cards.filter((card) => !card.hidden);
  const started = home?.gettingStarted;
  const showStart = started && !started.complete && !started.dismissed;

  // The main action is the first of these the member may do, the rest
  // under More (ADR-091); Trace a lot never alone, since a trade word and
  // an empty field are no way in for someone with no lot code: a role
  // with only that has the quiet line and whom to ask (ADR-091's review).
  const actions = [
    can('orders.create') && {
      to: '/orders/new',
      label: intl.formatMessage({
        id: 'orders.raise',
        defaultMessage: 'Raise an order',
      }),
      icon: <AddIcon />,
    },
    can('stock.move') && {
      to: '/inventory',
      label: intl.formatMessage({
        id: 'inventory.receive',
        defaultMessage: 'Receive stock',
      }),
      icon: <MoveToInboxOutlined />,
    },
    can('production.create') && {
      to: '/production',
      label: intl.formatMessage({
        id: 'production.plan',
        defaultMessage: 'Plan a run',
      }),
      icon: <PrecisionManufacturingOutlined />,
    },
    can('stock.view') && {
      to: '/lots',
      label: intl.formatMessage({
        id: 'inventory.trace.title',
        defaultMessage: 'Trace a lot',
      }),
      icon: <AccountTreeOutlined />,
    },
  ].filter((item): item is QuickAction => Boolean(item));
  const quick = actions.some((action) => action.to !== '/lots') ? actions : [];
  const refresh = intl.formatMessage({
    id: 'common.refresh',
    defaultMessage: 'Refresh',
  });

  if (!home && isRevisionRefusal(error)) {
    return <RevisionRefusalPage failure={error} onRetry={load} />;
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 1140 }}>
      {/* The main action at the right of the greeting's row from `md`, as
          each list page has its own; below it, under What we do, full
          width (ADR-091). */}
      <Stack
        direction={{ xs: 'column', md: 'row' }}
        sx={{
          justifyContent: 'space-between',
          alignItems: { xs: 'stretch', md: 'flex-start' },
          gap: 1.5,
        }}
      >
        <Stack spacing={0.75} sx={{ minWidth: 0 }}>
          <Stack direction="row" sx={{ alignItems: 'center', gap: 0.5 }}>
            <Typography ref={heading} variant="h5" component="h1" tabIndex={-1}>
              {greeting(intl, session?.user.name ?? '', zone)}
            </Typography>
            {/* Next after the heading, where Dismiss puts focus, so the
                next Tab reaches Undo; shown at the foot of the screen all
                the same, and held there while focus or the pointer is on
                it. */}
            <UndoSnackbar
              open={undoing}
              autoHideDuration={8000}
              onClose={(_event, reason) => {
                // A click elsewhere is somebody carrying on, not dismissing.
                if (reason !== 'clickaway') setUndoing(false);
              }}
              message={intl.formatMessage({
                id: 'home.welcome.dismissed',
                defaultMessage:
                  'Welcome card hidden. What you can do here stays on Your account.',
              })}
              action={
                <Button color="inherit" onClick={() => void undoWelcome()}>
                  {intl.formatMessage({
                    id: 'home.welcome.undo',
                    defaultMessage: 'Undo',
                  })}
                </Button>
              }
              slotProps={{ content: { role: 'status' } }}
            />
            {/* Beside the greeting, an icon with its name in a tooltip
                (ADR-091). */}
            <Tooltip title={refresh}>
              <IconButton aria-label={refresh} onClick={load}>
                <RefreshIcon />
              </IconButton>
            </Tooltip>
          </Stack>
          {/* The organization's day and time, which the tiles count from
              (ADR-072), moving on each minute by itself: not a live
              region, which would read it out every minute. */}
          <Typography
            variant="body2"
            sx={{
              color: 'text.secondary',
              display: 'flex',
              alignItems: 'center',
              gap: 0.75,
            }}
          >
            <CalendarTodayOutlined aria-hidden sx={{ fontSize: rem(16) }} />
            {intl.formatMessage(
              { id: 'home.dateTime', defaultMessage: '{day}, {time}' },
              {
                day: intl.formatDate(now, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  timeZone: zone,
                }),
                time: intl.formatTime(now, {
                  timeStyle: 'short',
                  timeZone: zone,
                }),
              },
            )}
          </Typography>
          {/* Only for a reader on another clock (ADR-072): their own date
              may already be tomorrow, or still yesterday. */}
          {differsFromBrowser(zone) && (
            <Typography
              variant="body2"
              sx={{
                display: 'flex',
                alignItems: 'center',
                flexWrap: 'wrap',
                gap: 1,
              }}
            >
              <ScheduleIcon fontSize="small" aria-hidden />
              {intl.formatMessage(
                {
                  id: 'home.timeZoneNote',
                  defaultMessage:
                    'Dates follow the organization’s time zone: {zone}.',
                },
                { zone: zoneLabel(zone) },
              )}
              {/* Where it is set, for whoever may change it: a wrong zone
                  shows here first. */}
              {can('organizations.update') && (
                <Link
                  component={RouterLink}
                  to="/settings/organization?tab=profile"
                  state={OFFER_BACK}
                  underline="always"
                >
                  {intl.formatMessage({
                    id: 'home.timeZoneChange',
                    defaultMessage: 'Change the time zone',
                  })}
                </Link>
              )}
            </Typography>
          )}
          {/* In the organization's own words, at the body's size and
              weight, without a card (ADR-091). */}
          {home?.whatWeDo && (
            <Typography sx={{ pt: 0.75 }}>{home.whatWeDo}</Typography>
          )}
        </Stack>
        {/* None while Getting started shows: its next step is the page's
            one main action (ADR-058), and a new organization has nothing
            to raise an order for yet (ADR-091's review). */}
        {showStart ? null : quick.length > 0 ? (
          <MainAction actions={quick} />
        ) : (
          // Where the button would be: whom to ask, from the welcome once
          // Home holds it, else read beside Home's own read, not after it.
          <Box sx={{ maxWidth: { md: rem(400) } }}>
            {welcome ? (
              <WhomToAsk access={welcome.access} {...NO_ACTIONS} />
            ) : (
              <WhomToAskRead {...NO_ACTIONS} />
            )}
          </Box>
        )}
      </Stack>

      {errorWords && <Alert severity="error">{errorWords}</Alert>}

      {!home ? (
        showSkeleton && (
          <Box sx={{ containerType: 'inline-size' }}>
            <Box sx={evenRowsSx(PLACEHOLDERS)}>
              {Array.from({ length: PLACEHOLDERS }, (_, index) => (
                <Skeleton key={index} variant="rounded" height={TILE_HEIGHT} />
              ))}
            </Box>
          </Box>
        )
      ) : (
        <>
          {welcome && (
            <WelcomeCard
              welcome={welcome}
              startShows={!!showStart}
              onDismiss={dismissWelcome}
              headingRef={welcomeHeading}
            />
          )}

          {/* Straight after the welcome, which says the steps are in
              Getting started, below; the tiles after both. */}
          {showStart && started && (
            <GettingStarted
              state={started}
              canManage={can('organizations.update')}
              canInvite={can('users.create')}
              onDismiss={() => {
                heading.current?.focus();
                void act('/home/getting-started/dismiss', 'POST');
              }}
              onSkipTeam={() =>
                void act('/home/getting-started/skip-team', 'POST')
              }
            />
          )}

          {/* After both, so the welcome opens where a newcomer looks first
              and Getting started stays above the fold on a laptop. */}
          <WhatIsLate cards={cards} />

          {tiles.length > 0 && (
            <Stack
              component="section"
              aria-labelledby="today-title"
              spacing={1.5}
            >
              <Typography variant="h6" component="h2" id="today-title">
                {intl.formatMessage({
                  id: 'home.today',
                  defaultMessage: 'What needs you today',
                })}
              </Typography>
              {/* In even rows, measured against the page's width rather
                  than the screen's (ADR-081). */}
              <Box sx={{ containerType: 'inline-size' }}>
                <Box sx={evenRowsSx(tiles.length)}>
                  {tiles.map((card) => (
                    <Tile key={card.kind} card={card} />
                  ))}
                </Box>
              </Box>
            </Stack>
          )}

          {/* What this person opened last; hidden while empty (ADR-058). */}
          <RecentCard />

          {started &&
            started.dismissed &&
            !started.complete &&
            can('organizations.update') && (
              <Box>
                <Button
                  variant="text"
                  onClick={() =>
                    void act('/home/getting-started/dismiss', 'DELETE')
                  }
                >
                  {intl.formatMessage({
                    id: 'home.start.show',
                    defaultMessage: 'Show Getting started',
                  })}
                </Button>
              </Box>
            )}
        </>
      )}
    </Stack>
  );
}

/**
 * Between a tile's parts, which a flex box does not draw but its words
 * keep: "To ship 12", never "To ship12", as accessibility checks read them.
 */
const SPACE = ' ';

/**
 * What is late (ADR-091): a pale red panel, its heading how many, a
 * button per kind opening that kind's list with Late (or Expired, or Out)
 * chosen too, so just the late ones. Nothing late, one grey line with a
 * tick in the same place; nothing at all, a line saying so.
 */
function WhatIsLate({ cards }: { cards: KnownCard[] }) {
  const intl = useIntl();
  const late = cards.filter((card) => CARDS[card.kind].late && card.late > 0);
  const total = late.reduce((sum, card) => sum + card.late, 0);

  if (total === 0) {
    const nothing = cards.every((card) => card.count === 0);
    return (
      <Paper
        variant="outlined"
        sx={{
          px: 2,
          py: 1.5,
          display: 'flex',
          alignItems: 'center',
          gap: 1.25,
        }}
      >
        <CheckCircleOutlineOutlined
          aria-hidden
          fontSize="small"
          sx={{ color: 'tone.positive.fg' }}
        />
        <Typography sx={{ color: 'text.secondary' }}>
          {nothing
            ? intl.formatMessage({
                id: 'home.late.nothing',
                defaultMessage: 'Nothing needs you today.',
              })
            : intl.formatMessage({
                id: 'home.late.none',
                defaultMessage: 'Nothing is late today.',
              })}
        </Typography>
      </Paper>
    );
  }

  return (
    <Paper
      variant="outlined"
      component="section"
      aria-labelledby="late-title"
      sx={{
        p: 2,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.5,
        bgcolor: 'tone.critical.bg',
        borderColor: 'tone.critical.border',
        color: 'tone.critical.fg',
      }}
    >
      <Stack direction="row" spacing={1.25} sx={{ alignItems: 'center' }}>
        <Box
          aria-hidden
          sx={{
            width: 32,
            height: 32,
            flex: 'none',
            borderRadius: '50%',
            bgcolor: 'background.paper',
            color: 'error.main',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <ErrorOutlineOutlined fontSize="small" />
        </Box>
        <Box>
          <Typography
            variant="h6"
            component="h2"
            id="late-title"
            sx={{ color: 'inherit' }}
          >
            {intl.formatMessage(
              {
                id: 'home.late.title',
                defaultMessage:
                  '{count, plural, one {# thing needs you now} other {# things need you now}}',
              },
              { count: total },
            )}
          </Typography>
          <Typography variant="body2" sx={{ color: 'inherit' }}>
            {intl.formatMessage({
              id: 'home.late.hint',
              defaultMessage: 'Choose one to see just those.',
            })}
          </Typography>
        </Box>
      </Stack>
      <Box
        component="ul"
        sx={{
          listStyle: 'none',
          m: 0,
          p: 0,
          display: 'flex',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        {late.map((card) => {
          const meta = CARDS[card.kind].late!;
          return (
            <li key={card.kind}>
              <ButtonBase
                component={RouterLink}
                to={meta.list}
                state={OFFER_BACK}
                sx={{
                  minHeight: 44,
                  pl: 1.75,
                  pr: 1.25,
                  gap: 0.75,
                  borderRadius: 999,
                  border: 1,
                  borderColor: 'tone.critical.border',
                  bgcolor: 'background.paper',
                  color: 'tone.critical.fg',
                  typography: 'body1',
                  [HOVER]: { '&:hover': { borderColor: 'tone.critical.fg' } },
                }}
              >
                <span>
                  {intl.formatMessage(meta.button, {
                    count: card.late,
                    b: (chunks: ReactNode[]) => <strong>{chunks}</strong>,
                  })}
                </span>
                <ChevronRight aria-hidden fontSize="small" />
              </ButtonBase>
            </li>
          );
        })}
      </Box>
    </Paper>
  );
}

/**
 * A tile (ADR-091): its kind's icon, red while anything in it is late; its
 * count in large figures; its name; and its status in words and colour
 * together. The whole tile is one link to its list, filtered and sorted
 * by what it counts. With nothing to do it stays in its place, quiet:
 * muted, its words in place of the count, still a link.
 */
function Tile({ card }: { card: KnownCard }) {
  const intl = useIntl();
  // The organization's days (ADR-060), for "No lots expiring in".
  const { warning: expiringWithin } = useExpiryDays();
  const meta = CARDS[card.kind];
  const Icon = meta.icon;
  const quiet = card.count === 0;
  const late = meta.late && card.late > 0 ? card.late : 0;
  // Nothing watched, not nothing low (ADR-085).
  const unset = card.anyPoint === false ? meta.unset : undefined;

  const name = intl.formatMessage(meta.title);
  const title = meta.page
    ? intl.formatMessage(
        { id: 'home.tile.ofPage', defaultMessage: '{page} · {name}' },
        { page: intl.formatMessage(meta.page), name },
      )
    : name;
  const status = quiet
    ? intl.formatMessage(unset?.empty ?? meta.empty, { days: expiringWithin })
    : late && meta.late
      ? intl.formatMessage(meta.late.pill, { count: late })
      : null;
  // "To ship, 12, 2 late": the name a screen reader reads, holding the
  // tile's visible words in their order (WCAG 2.5.3), so the name comes
  // first in the markup and only looks second.
  const count = intl.formatNumber(card.count);
  const label = quiet
    ? intl.formatMessage(
        { id: 'home.tile.quiet', defaultMessage: '{name}, {words}' },
        { name: title, words: status },
      )
    : status
      ? intl.formatMessage(
          {
            id: 'home.tile.status',
            defaultMessage: '{name}, {count}, {status}',
          },
          { name: title, count, status },
        )
      : intl.formatMessage(
          { id: 'home.tile.count', defaultMessage: '{name}, {count}' },
          { name: title, count },
        );

  return (
    <ButtonBase
      component={RouterLink}
      to={unset?.list ?? meta.list}
      state={OFFER_BACK}
      aria-label={label}
      sx={(theme) => ({
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'stretch',
        justifyContent: 'flex-start',
        gap: 1.25,
        minHeight: TILE_HEIGHT,
        p: 2,
        textAlign: 'start',
        border: 1,
        borderColor: 'divider',
        borderRadius: `${RADIUS.panel}px`,
        bgcolor: quiet ? 'background.default' : 'background.paper',
        color: quiet ? 'text.secondary' : 'text.primary',
        transition: theme.transitions.create(
          ['border-color', 'box-shadow', 'transform'],
          { duration: theme.transitions.duration.shortest },
        ),
        [HOVER]: {
          '&:hover': {
            borderColor: 'primary.main',
            // The lift token, as the variable the app's theme makes of it.
            boxShadow: theme.vars?.palette.surface.lift,
            transform: 'translateY(-2px)',
          },
        },
      })}
    >
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <Box
          aria-hidden
          sx={{
            width: 40,
            height: 40,
            borderRadius: `${RADIUS.control}px`,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            ...(late
              ? { bgcolor: 'tone.critical.bg', color: 'tone.critical.fg' }
              : quiet
                ? { bgcolor: 'tone.neutral.bg', color: 'text.secondary' }
                : { bgcolor: 'surface.chosen', color: 'primary.main' }),
          }}
        >
          <Icon fontSize="small" />
        </Box>
        <ChevronRight
          aria-hidden
          fontSize="small"
          sx={{ color: 'text.secondary' }}
        />
      </Box>
      {/* The name first in the markup, the count drawn above it, so the
          words read from the tile are its name's, "To ship 12 2 late". */}
      <Box sx={{ display: 'flex', flexDirection: 'column' }}>
        <Typography component="span" sx={{ order: 1, fontWeight: 600 }}>
          {title}
        </Typography>
        {SPACE}
        {quiet ? (
          <Typography
            component="span"
            sx={{ order: 2, color: 'text.secondary' }}
          >
            {status}
          </Typography>
        ) : (
          <Typography
            component="span"
            sx={{
              order: 0,
              // In rem, so it grows with the text size (ADR-075): the
              // figure read across a room, on the 4 px grid.
              fontSize: rem(32),
              lineHeight: 40 / 32,
              fontWeight: 700,
            }}
          >
            {count}
          </Typography>
        )}
      </Box>
      {SPACE}
      {late > 0 && status && (
        <Box sx={{ alignSelf: 'flex-start' }}>
          <StatusChip
            tone="critical"
            label={status}
            icon={<ErrorOutlineOutlined />}
          />
        </Box>
      )}
    </ButtonBase>
  );
}

/** Where the member may use none of Home's actions (ADR-091). */
const NO_ACTIONS = defineMessages({
  ask: {
    id: 'home.actions.ask',
    defaultMessage:
      'Your role does not include raising orders, receiving stock or planning runs. To do more, ask {names}.',
  },
  none: {
    id: 'home.actions.none',
    defaultMessage:
      'Your role does not include raising orders, receiving stock or planning runs.',
  },
});
