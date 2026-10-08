import RefreshIcon from '@mui/icons-material/Refresh';
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
import { useCallback, useEffect, useState } from 'react';
import { useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { useCan } from '../auth/permissions';
import { useAuth } from '../auth/use-auth';
import { StatusChip } from '../components/status-chip';
import { api } from '../lib/api';
import { dayOf } from '../lib/date-range';
import { formatDay } from '../lib/format';
import type { HomeCard, HomeResponse, HomeRow } from '../lib/types';
import { GettingStarted } from './getting-started';
import { CARDS, daysUntil } from './home-cards';

/**
 * Home (ADR-058): what needs attention, first. A greeting by the reader's
 * clock, one sentence saying how much needs doing, a row of counts (tinted
 * only when something is late or near expiry), the quick actions, then a
 * card per kind of work the reader's role sees. A new organization gets
 * Getting started instead of a page of zeros.
 *
 * Read when the page opens, with a refresh, as every list is; not live.
 */
export function HomePage() {
  const intl = useIntl();
  const { session } = useAuth();
  const can = useCan();
  const [home, setHome] = useState<HomeResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const today = dayOf(new Date());

  const load = useCallback(() => {
    api<HomeResponse>(`/home?today=${today}`)
      .then((response) => {
        setHome(response);
        setError(null);
      })
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : String(caught)),
      );
  }, [today]);

  useEffect(() => {
    load();
  }, [load]);

  async function act(path: string, method: 'POST' | 'DELETE') {
    await api(path, { method }).catch(() => undefined);
    load();
  }

  const hour = new Date().getHours();
  const name = session?.user.name ?? '';
  const greeting =
    hour < 12
      ? intl.formatMessage(
          {
            id: 'home.greeting.morning',
            defaultMessage: 'Good morning, {name}',
          },
          { name },
        )
      : hour < 18
        ? intl.formatMessage(
            {
              id: 'home.greeting.afternoon',
              defaultMessage: 'Good afternoon, {name}',
            },
            { name },
          )
        : intl.formatMessage(
            {
              id: 'home.greeting.evening',
              defaultMessage: 'Good evening, {name}',
            },
            { name },
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
        <Typography variant="h4" component="h1">
          {greeting}
        </Typography>
        <Stack direction="row" spacing={1} sx={{ alignItems: 'center' }}>
          <Typography color="text.secondary">
            {intl.formatDate(new Date(), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
            {session?.organization?.name &&
              intl.formatMessage(
                { id: 'home.organization', defaultMessage: ' · {name}' },
                { name: session.organization.name },
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

      {error && <Alert severity="error">{error}</Alert>}

      {!home ? (
        <Skeleton variant="rounded" height={120} />
      ) : (
        <>
          <Typography sx={{ mt: -1.5, fontSize: 17 }} color="text.secondary">
            {summary}
          </Typography>

          {showCards && cards.length > 0 && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 1.5,
              }}
            >
              {cards.map((card) => (
                <CountTile key={card.kind} card={card} />
              ))}
            </Box>
          )}

          {quick.length > 0 && (
            <Stack direction="row" sx={{ flexWrap: 'wrap', gap: 1.25 }}>
              {quick.map((item, index) => (
                <Button
                  key={item.to + item.label}
                  component={RouterLink}
                  to={item.to}
                  variant={index === 0 ? 'contained' : 'outlined'}
                >
                  {item.label}
                </Button>
              ))}
            </Stack>
          )}

          {showStart && started && (
            <GettingStarted
              state={started}
              canManage={can('organizations.update')}
              onDismiss={() =>
                void act('/home/getting-started/dismiss', 'POST')
              }
              onSkipTeam={() =>
                void act('/home/getting-started/skip-team', 'POST')
              }
            />
          )}

          {showCards && (
            <Box
              sx={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
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
        bgcolor: tone ? 'error.light' : 'background.paper',
        color: tone ? 'error.dark' : 'text.primary',
        borderColor: tone ? 'transparent' : 'divider',
      }}
    >
      <Typography variant="body2" sx={{ color: 'inherit' }}>
        {intl.formatMessage(meta.title)}
      </Typography>
      <Typography
        sx={{
          fontSize: 30,
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
      </Stack>
      {card.rows.length === 0 ? (
        <Typography
          sx={{ py: 1, borderTop: 1, borderColor: 'divider' }}
          color="success.dark"
        >
          {intl.formatMessage(meta.empty)}
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
        {row.detail && (
          <Typography component="span" color="text.secondary" sx={{ ml: 1 }}>
            {row.detail}
          </Typography>
        )}
      </Box>
      {chip ? (
        <StatusChip tone={chip.tone} label={chip.label} />
      ) : note ? (
        <Typography
          variant="body2"
          color="text.secondary"
          sx={{ whiteSpace: 'nowrap' }}
        >
          {note}
        </Typography>
      ) : null}
    </Stack>
  );
}
