import {
  Alert,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { defineMessages, useIntl } from 'react-intl';

import { api } from '../lib/api';
import { NO_VALUE, relativeTime } from '../lib/format';
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
const ACTION_LABELS = defineMessages({
  'account.registered': {
    id: 'account.activity.registered',
    defaultMessage: 'Account created',
  },
  'session.created': {
    id: 'account.activity.signedIn',
    defaultMessage: 'Signed in',
  },
  'session.ended': {
    id: 'account.activity.signedOut',
    defaultMessage: 'Signed out',
  },
  'session.revoked': {
    id: 'account.activity.deviceSignedOut',
    defaultMessage: 'A device was signed out',
  },
  'account.password_changed': {
    id: 'account.activity.passwordChanged',
    defaultMessage: 'Password changed',
  },
  'account.password_reset': {
    id: 'account.activity.passwordReset',
    defaultMessage: 'Password reset',
  },
  'account.profile_updated': {
    id: 'account.activity.profileUpdated',
    defaultMessage: 'Profile updated',
  },
  'account.email_verified': {
    id: 'account.activity.emailVerified',
    defaultMessage: 'Email verified',
  },
  'account.verification_resent': {
    id: 'account.activity.verificationResent',
    defaultMessage: 'Verification email resent',
  },
});

function isKnownAction(action: string): action is keyof typeof ACTION_LABELS {
  return action in ACTION_LABELS;
}

/**
 * The browser, roughly.
 *
 * A user agent is a paragraph and nobody reads one. This is enough to answer
 * "was that my laptop" and no more — and deliberately crude, because a proper
 * parser is a dependency for a column that only has to jog a memory.
 */
function browserOf(userAgent: string | null): string | null {
  if (!userAgent) return '—';

  // Product names, the same in every language.
  for (const name of ['Firefox', 'Edg', 'Chrome', 'Safari']) {
    if (userAgent.includes(name)) return name === 'Edg' ? 'Edge' : name;
  }

  // Not one of them: the caller says "Other" in the reader's language.
  return null;
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
  const intl = useIntl();
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
        {intl.formatMessage({
          id: 'account.activity.title',
          defaultMessage: 'Recent activity',
        })}
      </Typography>

      <Typography variant="body2" color="text.secondary">
        {intl.formatMessage({
          id: 'account.activity.intro',
          defaultMessage:
            'The last ninety days. Anything you do not recognise is worth changing your password over.',
        })}
      </Typography>

      {/* A failure here costs the panel, not the page: the session list above
          is the part somebody came to act on. */}
      {error && (
        <Alert severity="warning">
          {intl.formatMessage({
            id: 'account.activity.loadFailed',
            defaultMessage: 'Could not load recent activity.',
          })}
        </Alert>
      )}

      {loading && showSkeleton && <Skeleton height={160} />}

      {events?.length === 0 && (
        <Alert severity="info">
          {intl.formatMessage({
            id: 'account.activity.empty',
            defaultMessage: 'Nothing recorded yet.',
          })}
        </Alert>
      )}

      {!!events?.length && (
        <Paper variant="outlined">
          <TableContainer>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'account.activity.what',
                      defaultMessage: 'What',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'account.activity.browser',
                      defaultMessage: 'Browser',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'account.activity.from',
                      defaultMessage: 'From',
                    })}
                  </TableCell>
                  <TableCell>
                    {intl.formatMessage({
                      id: 'account.activity.when',
                      defaultMessage: 'When',
                    })}
                  </TableCell>
                </TableRow>
              </TableHead>

              <TableBody>
                {events.map((event) => (
                  <TableRow key={event.id}>
                    <TableCell>
                      {isKnownAction(event.action)
                        ? intl.formatMessage(ACTION_LABELS[event.action])
                        : event.action}
                    </TableCell>
                    <TableCell>
                      {browserOf(event.userAgent) ??
                        intl.formatMessage({
                          id: 'account.activity.otherBrowser',
                          defaultMessage: 'Other',
                        })}
                    </TableCell>
                    <TableCell>{event.ip ?? NO_VALUE}</TableCell>
                    <TableCell>{relativeTime(event.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      )}
    </Stack>
  );
}
