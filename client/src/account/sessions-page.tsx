import {
  Alert,
  Button,
  Chip,
  CircularProgress,
  Link,
  List,
  ListItem,
  ListItemText,
  Paper,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useState } from 'react';
import { type IntlShape, useIntl } from 'react-intl';
import { Link as RouterLink } from 'react-router-dom';

import { PageHeader } from '../components/page-header';
import { api, messageFor } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import { useResource } from '../lib/use-resource';
import { RecentActivity } from './recent-activity';

interface SessionSummary {
  id: string;
  issuedAt: string;
  lastSeenAt: string;
  expiresAt: string;
  ip: string | null;
  browser: string | null;
  os: string | null;
  /** The session making this request. Revoking it is disabled. */
  current: boolean;
}

/** "Chrome on macOS", degrading as far as the agent allows. */
function describe(session: SessionSummary, intl: IntlShape): string {
  if (session.browser && session.os) {
    return intl.formatMessage(
      {
        id: 'account.sessions.browserOnOs',
        defaultMessage: '{browser} on {os}',
      },
      { browser: session.browser, os: session.os },
    );
  }
  return (
    session.browser ??
    session.os ??
    intl.formatMessage({
      id: 'account.sessions.unknownDevice',
      defaultMessage: 'Unknown device',
    })
  );
}

export function SessionsPage() {
  const intl = useIntl();
  const {
    data: sessions,
    error,
    setError,
    loading,
    reload,
  } = useResource<SessionSummary[]>('/account/sessions');
  const [revoking, setRevoking] = useState<string | null>(null);

  const showSkeleton = useDelayedFlag(loading);

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);

    try {
      await api(`/account/sessions/${id}`, { method: 'DELETE' });
      // Re-read rather than splicing the row out locally: another device may
      // have signed in or out since this list was drawn, and the server's
      // answer is the one that is true.
      await reload();
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setRevoking(null);
    }
  }

  const list = sessions?.length ? (
    <List disablePadding>
      {sessions?.map((session) => (
        <ListItem
          key={session.id}
          divider
          secondaryAction={
            // The current session is disabled rather than hidden: the
            // user needs to see the device they are on. Ending it is
            // sign-out, which clears the cookie in the right order.
            session.current ? (
              <Chip
                label={intl.formatMessage({
                  id: 'account.sessions.thisDevice',
                  defaultMessage: 'This device',
                })}
                size="small"
              />
            ) : (
              <Button
                variant="text"
                size="small"
                color="error"
                disabled={revoking !== null}
                onClick={() => void revoke(session.id)}
              >
                {revoking === session.id ? (
                  <CircularProgress size={16} />
                ) : (
                  intl.formatMessage({
                    id: 'layout.signOut',
                    defaultMessage: 'Sign out',
                  })
                )}
              </Button>
            )
          }
        >
          <ListItemText
            primary={describe(session, intl)}
            secondary={intl.formatMessage(
              {
                id: 'account.sessions.lastActive',
                defaultMessage:
                  'Last active {when}{ip, select, none {} other { · {ip}}}',
              },
              {
                when: relativeTime(session.lastSeenAt),
                ip: session.ip ?? 'none',
              },
            )}
          />
        </ListItem>
      ))}
    </List>
  ) : (
    // Barely reachable: the caller's own session is always in this list. An
    // empty array means it disappeared between the request and the render —
    // worth saying rather than showing a blank box.
    <Typography color="text.secondary" sx={{ p: 3 }}>
      {intl.formatMessage({
        id: 'account.sessions.empty',
        defaultMessage: 'No active sessions. Try refreshing.',
      })}
    </Typography>
  );

  return (
    // Heading and description draw immediately; only the list holds space and
    // fills in. A full-page spinner here would discard structure already known
    // to be correct.
    <Stack spacing={3}>
      <PageHeader
        crumbs={[
          {
            label: intl.formatMessage({
              id: 'account.title',
              defaultMessage: 'Account',
            }),
            to: '/account',
          },
        ]}
        title={intl.formatMessage({
          id: 'account.sessions.title',
          defaultMessage: 'Your devices',
        })}
        actions={
          <Button
            variant="text"
            disabled={loading || revoking !== null}
            onClick={() => void reload()}
          >
            {intl.formatMessage({
              id: 'common.refresh',
              defaultMessage: 'Refresh',
            })}
          </Button>
        }
        subtitle={intl.formatMessage({
          id: 'account.sessions.intro',
          defaultMessage:
            'Every device signed in to your account. If you do not recognise one, sign it out and change your password.',
        })}
      />

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : (
          list
        )}
      </Paper>

      <RecentActivity />

      <Link component={RouterLink} to="/account">
        {intl.formatMessage({
          id: 'account.sessions.backToAccount',
          defaultMessage: 'Back to account',
        })}
      </Link>
    </Stack>
  );
}
