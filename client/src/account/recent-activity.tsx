import {
  Alert,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';

import { api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';

interface AccountEvent {
  id: string;
  action: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
}

/**
 * Wording for the seven account events (ADR-022).
 *
 * A closed map rather than derived text, unlike the audit log's: this list is
 * fixed and small, and the phrasing matters more — somebody is reading it to
 * decide whether they recognise what happened, so "Signed in" beats "Session
 * created".
 */
const ACTION_LABELS: Record<string, string> = {
  'account.registered': 'Account created',
  'session.created': 'Signed in',
  'session.ended': 'Signed out',
  'session.revoked': 'A device was signed out',
  'account.password_changed': 'Password changed',
  'account.password_reset': 'Password reset',
  'account.profile_updated': 'Profile updated',
  'account.email_verified': 'Email verified',
};

/**
 * The browser, roughly.
 *
 * A user agent is a paragraph and nobody reads one. This is enough to answer
 * "was that my laptop" and no more — and deliberately crude, because a proper
 * parser is a dependency for a column that only has to jog a memory.
 */
function browserOf(userAgent: string | null): string {
  if (!userAgent) return '—';

  for (const name of ['Firefox', 'Edg', 'Chrome', 'Safari']) {
    if (userAgent.includes(name)) return name === 'Edg' ? 'Edge' : name;
  }

  return 'Other';
}

/**
 * What has happened to this account lately.
 *
 * The other half of the sessions list above it. That list says which devices
 * are signed in now; this says what happened, which is what makes "if you do
 * not recognise one, sign it out and change your password" actionable — a
 * password reset nobody requested is the strongest signal there is, and it
 * leaves no session behind to notice.
 *
 * Read-only and unpaged: ninety days of one person's account activity is a
 * short list (ADR-022), and a Load more button on a panel nobody scrolls is
 * furniture.
 */
export function RecentActivity() {
  const [events, setEvents] = useState<AccountEvent[] | null>(null);
  const [error, setError] = useState(false);

  const loading = events === null && !error;
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    void api<AccountEvent[]>('/account/events')
      .then((rows) => {
        if (!ignore) setEvents(rows);
      })
      .catch(() => {
        if (!ignore) setError(true);
      });

    return () => {
      ignore = true;
    };
  }, []);

  return (
    <Stack spacing={2}>
      <Typography variant="h6" component="h2">
        Recent activity
      </Typography>

      <Typography variant="body2" color="text.secondary">
        The last ninety days. Anything you do not recognise is worth changing
        your password over.
      </Typography>

      {/* A failure here costs the panel, not the page: the session list above
          is the part somebody came to act on. */}
      {error && (
        <Alert severity="warning">Could not load recent activity.</Alert>
      )}

      {loading && showSkeleton && <Skeleton height={160} />}

      {events?.length === 0 && (
        <Alert severity="info">Nothing recorded yet.</Alert>
      )}

      {!!events?.length && (
        <Paper variant="outlined">
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>What</TableCell>
                <TableCell>Browser</TableCell>
                <TableCell>From</TableCell>
                <TableCell>When</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {events.map((event) => (
                <TableRow key={event.id}>
                  <TableCell>
                    {ACTION_LABELS[event.action] ?? event.action}
                  </TableCell>
                  <TableCell>{browserOf(event.userAgent)}</TableCell>
                  <TableCell>{event.ip ?? '—'}</TableCell>
                  <TableCell>{relativeTime(event.createdAt)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}
    </Stack>
  );
}
