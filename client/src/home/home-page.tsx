import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import {
  Alert,
  Box,
  Button,
  Link,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import type { HomeCard, HomeResponse, HomeRow } from '../api/types.gen';
import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { ReferencesWhole } from '../components/reference';
import { StatusChip } from '../components/status-chip';
import { UndoSnackbar } from '../components/undo-snackbar';
import { RevisionRefusalPage } from '../errors/revision-refusal-page';
import { useCoverUnverifiedBanner } from '../layout/use-cover-unverified-banner';
import { api, isRevisionRefusal } from '../lib/api';
import { daysUntil } from '../lib/expiry';
import { formatDay } from '../lib/format';
import {
  differsFromBrowser,
  organizationTimeZone,
  organizationToday,
} from '../lib/time-zone';
import { zoneLabel } from '../lib/time-zone-label';
import { useExpiryDays } from '../lib/use-expiry-days';
import { useFailureWords } from '../lib/use-failure-words';
import { rem } from '../theme/rem';
import { TYPE } from '../theme/tokens';
import { evenRowsSx } from './even-rows';
import { GettingStarted } from './getting-started';
import { greeting } from './greeting';
import { CARDS } from './home-cards';
import { NoOrganization } from './no-organization';
import { RecentCard } from './recent-card';
import { WelcomeCard } from './welcome-card';

/**
 * Home (ADR-058): what needs attention, first. A greeting by the reader's
 * clock, one sentence saying how much needs doing, a row of counts (tinted
 * only when something is late or near expiry), the quick actions, then a
 * card per kind of work the reader's role sees. A new organization gets
 * Getting started instead of a page of zeros. A newcomer's own welcome
 * leads it for their first two weeks (ADR-079), with Getting started, while
 * it shows, straight after it and before the counts and quick actions.
 *
 * Read when the page opens, with a refresh, as every list is; not live.
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
  // The organization's today (ADR-072), so "overdue" is the same for
  // everyone in it, wherever they read it from.
  const today = organizationToday();
  const zone = organizationTimeZone();

  // The server counts the cards from the same day itself.
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

  const cards = home?.cards ?? [];
  const count = cards.reduce((sum, card) => sum + card.count, 0);
  const late = cards.reduce((sum, card) => sum + card.late, 0);
  const started = home?.gettingStarted;
  const showStart = started && !started.complete && !started.dismissed;
  // While a new organization has nothing to do yet, Getting started is
  // the page; once anything needs attention, the cards come back.
  const showCards = !showStart || count > 0;

  const summary =
    showStart && count === 0
      ? intl.formatMessage({
          id: 'home.summary.start',
          defaultMessage:
            'Seven steps get your organization ready to work. Each is ticked when it is done.',
        })
      : count === 0
        ? intl.formatMessage({
            id: 'home.summary.none',
            defaultMessage: 'Nothing needs attention today.',
          })
        : late === 0
          ? intl.formatMessage(
              {
                id: 'home.summary',
                defaultMessage:
                  '{count, plural, one {# thing needs attention.} other {# things need attention.}}',
              },
              { count },
            )
          : intl.formatMessage(
              {
                id: 'home.summary.late',
                defaultMessage:
                  '{count, plural, one {# thing needs attention} other {# things need attention}}, {late, plural, one {# of them overdue} other {# of them overdue}}.',
              },
              { count, late },
            );

  const quick = [
    can('orders.create') && {
      to: '/orders/new',
      label: intl.formatMessage({
        id: 'orders.raise',
        defaultMessage: 'Raise an order',
      }),
    },
    can('stock.move') && {
      to: '/inventory',
      label: intl.formatMessage({
        id: 'inventory.receive',
        defaultMessage: 'Receive stock',
      }),
    },
    can('stock.view') && {
      to: '/lots',
      label: intl.formatMessage({
        id: 'inventory.trace.title',
        defaultMessage: 'Trace a lot',
      }),
    },
    can('production.create') && {
      to: '/production',
      label: intl.formatMessage({
        id: 'production.plan',
        defaultMessage: 'Plan a run',
      }),
    },
  ].filter((item): item is { to: string; label: string } => Boolean(item));

  if (!home && isRevisionRefusal(error)) {
    return <RevisionRefusalPage failure={error} onRetry={load} />;
  }

  return (
    <Stack spacing={3} sx={{ maxWidth: 1140 }}>
      <Stack
        direction="row"
        sx={{
          justifyContent: 'space-between',
          alignItems: 'baseline',
          flexWrap: 'wrap',
          gap: 1,
        }}
      >
        <Typography ref={heading} variant="h4" component="h1" tabIndex={-1}>
          {greeting(intl, session?.user.name ?? '')}
        </Typography>
        {/* Next after the heading, where Dismiss puts focus, so the next
            Tab reaches Undo; shown at the foot of the screen all the same,
            and held there while focus or the pointer is on it. */}
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
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography sx={{ color: 'text.secondary' }}>
            {intl.formatDate(new Date(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              // The organization's date, which the cards count from.
              timeZone: zone,
            })}
            {/* The space outside the message: extraction trims a
                message's own, and English lost it. */}
            {session?.organization?.name && (
              <>
                {' '}
                {intl.formatMessage(
                  { id: 'home.organization', defaultMessage: '· {name}' },
                  { name: session.organization.name },
                )}
              </>
            )}
          </Typography>
          <Button variant="text" startIcon={<RefreshIcon />} onClick={load}>
            {intl.formatMessage({
              id: 'common.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        </Stack>
      </Stack>

      {/* Only for a reader on another clock (ADR-072): their own date
          may already be tomorrow, or still yesterday. */}
      {differsFromBrowser(zone) && (
        <Typography
          variant="body2"
          sx={{
            mt: -2,
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
          {/* Where it is set, for whoever may change it, as Change the
              days is: a wrong zone shows here first. */}
          {can('organizations.update') && (
            <Link
              component={RouterLink}
              to="/settings/organization?tab=profile"
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

      {errorWords && <Alert severity="error">{errorWords}</Alert>}

      {!home ? (
        <Skeleton variant="rounded" height={120} />
      ) : (
        <>
          <Typography
            sx={{
              color: 'text.secondary',
              mt: -1.5,
              fontSize: rem(TYPE.section),
            }}
          >
            {summary}
          </Typography>

          {welcome && (
            <WelcomeCard
              welcome={welcome}
              startShows={!!showStart}
              onDismiss={dismissWelcome}
              headingRef={welcomeHeading}
            />
          )}

          {/* Straight after the welcome, which says the steps are in
              Getting started, below; the quick actions after both. */}
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

          {/* In even rows, measured against the page's width rather than
              the screen's (ADR-081). */}
          {showCards && cards.length > 0 && (
            <Box sx={{ containerType: 'inline-size' }}>
              <Box sx={evenRowsSx(cards.length)}>
                {cards.map((card) => (
                  <CountTile key={card.kind} card={card} />
                ))}
              </Box>
            </Box>
          )}

          {quick.length > 0 && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25 }}>
              {quick.map((item, index) => (
                <Button
                  key={item.to + item.label}
                  component={RouterLink}
                  to={item.to}
                  // While Getting started shows, its first open step is the
                  // page's one primary action (ADR-058).
                  variant={index === 0 && !showStart ? 'contained' : 'outlined'}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
          )}

          {/* What this person opened last; hidden while empty (ADR-058). */}
          <RecentCard />

          {/* A column's floor is capped at the row, so on a phone a card is
              as wide as the screen rather than wider (found by
              text-size.spec at 320px). */}
          {showCards && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: `repeat(auto-fit, minmax(min(${rem(320)}, 100%), 1fr))`,
                gap: 2,
              }}
            >
              {cards.map((card) => (
                <CardPanel key={card.kind} card={card} today={today} />
              ))}
            </Box>
          )}

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

/** A count at a glance, tinted only when something in it is late. */
function CountTile({ card }: { card: HomeCard }) {
  const intl = useIntl();
  const meta = CARDS[card.kind];
  const tone = card.late > 0 ? 'critical' : null;

  return (
    <Paper
      component="a"
      href={`#${card.kind}`}
      variant="outlined"
      sx={{
        p: 1.75,
        textDecoration: 'none',
        display: 'flex',
        flexDirection: 'column',
        gap: 0.25,
        // The critical tone's tint and text, as a red chip's, which hold
        // AA in both modes (tokens.ts).
        bgcolor: tone ? 'tone.critical.bg' : 'background.paper',
        color: tone ? 'tone.critical.fg' : 'text.primary',
        borderColor: tone ? 'tone.critical.border' : 'divider',
      }}
    >
      <Typography variant="body2" sx={{ color: 'inherit' }}>
        {intl.formatMessage(meta.title)}
      </Typography>
      <Typography
        sx={{
          // In rem, so it grows with the text size (ADR-075).
          fontSize: rem(30),
          fontWeight: 700,
          lineHeight: 1.2,
          color: 'inherit',
        }}
      >
        {intl.formatNumber(card.count)}
      </Typography>
      {card.late > 0 && (
        <Typography variant="body2" sx={{ color: 'inherit' }}>
          {meta.lateIsExpired
            ? intl.formatMessage(
                {
                  id: 'home.count.expired',
                  defaultMessage: '{count, plural, other {# expired}}',
                },
                { count: card.late },
              )
            : intl.formatMessage(
                {
                  id: 'home.count.late',
                  defaultMessage: '{count, plural, other {# overdue}}',
                },
                { count: card.late },
              )}
        </Typography>
      )}
    </Paper>
  );
}

/** One card: its title, "See all", and its five most urgent rows. */
function CardPanel({ card, today }: { card: HomeCard; today: string }) {
  const intl = useIntl();
  const can = useCan();
  // The organization's days (ADR-060), for "Nothing expires within".
  const { warning: expiringWithin } = useExpiryDays();
  const meta = CARDS[card.kind];
  const Icon = meta.icon;

  return (
    <Paper
      variant="outlined"
      component="section"
      id={card.kind}
      aria-labelledby={`${card.kind}-title`}
      sx={{ p: 2.5 }}
    >
      <Stack
        direction="row"
        sx={{ justifyContent: 'space-between', alignItems: 'baseline', mb: 1 }}
      >
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Icon fontSize="small" aria-hidden />
          <Typography variant="h6" component="h2" id={`${card.kind}-title`}>
            {intl.formatMessage(meta.title)}
          </Typography>
        </Stack>
        {card.count > 0 && (
          <Link component={RouterLink} to={meta.list} underline="always">
            {intl.formatMessage(
              { id: 'home.seeAll', defaultMessage: 'See all {count}' },
              { count: card.count },
            )}
          </Link>
        )}
        {/* Where the days come from, for whoever may change them
            (ADR-060, ADR-061). */}
        {card.kind === 'expiring' && can('organizations.update') && (
          <Link
            component={RouterLink}
            to="/settings/organization?tab=stock"
            underline="hover"
            variant="body2"
            sx={{ color: 'text.secondary' }}
          >
            {intl.formatMessage({
              id: 'home.expiringDays',
              defaultMessage: 'Change the days',
            })}
          </Link>
        )}
      </Stack>
      {card.rows.length === 0 ? (
        // The positive tone's text, which reads on a card in both modes
        // (ADR-081). In sx: Typography's color prop takes a palette name,
        // not a path such as this.
        <Typography
          sx={{
            py: 1,
            borderTop: 1,
            borderColor: 'divider',
            color: 'tone.positive.fg',
          }}
        >
          {intl.formatMessage(meta.empty, { days: expiringWithin })}
        </Typography>
      ) : (
        card.rows.map((row) => (
          <RowLine
            key={row.id}
            row={row}
            path={meta.rowPath(row.id)}
            expired={meta.lateIsExpired}
            today={today}
          />
        ))
      )}
    </Paper>
  );
}

function RowLine({
  row,
  path,
  expired,
  today,
}: {
  row: HomeRow;
  path: string | null;
  expired: boolean;
  today: string;
}) {
  const intl = useIntl();
  const days = row.due ? daysUntil(row.due, today) : null;

  let chip: { tone: 'critical' | 'warning'; label: string } | null = null;
  let note: string | null = null;
  if (days !== null && row.due) {
    if (expired) {
      if (days < 0) {
        chip = {
          tone: 'critical',
          label: intl.formatMessage({
            id: 'home.chip.expired',
            defaultMessage: 'expired',
          }),
        };
      } else {
        chip = {
          tone: days <= 30 ? 'critical' : 'warning',
          label: intl.formatMessage(
            {
              id: 'home.chip.daysLeft',
              defaultMessage:
                '{days, plural, one {# day left} other {# days left}}',
            },
            { days },
          ),
        };
      }
    } else if (days < 0) {
      chip = {
        tone: 'critical',
        label: intl.formatMessage(
          {
            id: 'home.chip.late',
            defaultMessage:
              '{days, plural, one {# day late} other {# days late}}',
          },
          { days: -days },
        ),
      };
    } else {
      note = intl.formatMessage(
        { id: 'home.chip.due', defaultMessage: 'due {date}' },
        { date: formatDay(row.due) },
      );
    }
  }

  return (
    <Stack
      direction="row"
      sx={{
        justifyContent: 'space-between',
        gap: 1.5,
        py: 1,
        borderTop: 1,
        borderColor: 'divider',
        alignItems: 'center',
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        {path ? (
          <Link component={RouterLink} to={path} sx={{ fontWeight: 600 }}>
            {row.title}
          </Link>
        ) : (
          <Typography component="span" sx={{ fontWeight: 600 }}>
            {row.title}
          </Typography>
        )}
        {/* A space rather than a margin, so the line may break between the
            title and the detail; the detail's references, the customer's
            SO-DEMO-1, found by their hyphens in the server's words and kept
            whole (ADR-081). */}
        {row.detail && (
          <>
            {' '}
            <Typography component="span" sx={{ color: 'text.secondary' }}>
              <ReferencesWhole text={row.detail} />
            </Typography>
          </>
        )}
      </Box>
      {chip ? (
        <StatusChip tone={chip.tone} label={chip.label} />
      ) : note ? (
        <Typography
          variant="body2"
          sx={{ color: 'text.secondary', whiteSpace: 'nowrap' }}
        >
          {note}
        </Typography>
      ) : null}
    </Stack>
  );
}
