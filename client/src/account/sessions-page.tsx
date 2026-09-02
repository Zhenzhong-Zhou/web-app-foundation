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
import { useCallback, useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { ApiError, api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';

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
function describe(session: SessionSummary): string {
  if (session.browser && session.os)
    return `${session.browser} on ${session.os}`;
  return session.browser ?? session.os ?? 'Unknown device';
}

export function SessionsPage() {
  const [sessions, setSessions] = useState<SessionSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<string | null>(null);

  const loading = sessions === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  const load = useCallback(async () => {
    try {
      setSessions(await api<SessionSummary[]>('/account/sessions'));
      setError(null);
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
    }
  }, []);

  useEffect(() => {
    let ignore = false;

    void api<SessionSummary[]>('/account/sessions')
      .then((rows) => {
        if (!ignore) setSessions(rows);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setError(
          caught instanceof ApiError
            ? caught.message
            : 'Could not reach the server.',
        );
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function revoke(id: string) {
    setRevoking(id);
    setError(null);

    try {
      await api(`/account/sessions/${id}`, { method: 'DELETE' });
      // Re-read rather than splicing the row out locally: another device may
      // have signed in or out since this list was drawn, and the server's
      // answer is the one that is true.
      await load();
    } catch (caught) {
      setError(
        caught instanceof ApiError
          ? caught.message
          : 'Could not reach the server.',
      );
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
              <Chip label="This device" size="small" />
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
                  'Sign out'
                )}
              </Button>
            )
          }
        >
          <ListItemText
            primary={describe(session)}
            secondary={
              <>
                Last active {relativeTime(session.lastSeenAt)}
                {session.ip ? ` · ${session.ip}` : ''}
              </>
            }
          />
        </ListItem>
      ))}
    </List>
  ) : (
    // Barely reachable: the caller's own session is always in this list. An
    // empty array means it disappeared between the request and the render —
    // worth saying rather than showing a blank box.
    <Typography color="text.secondary" sx={{ p: 3 }}>
      No active sessions. Try refreshing.
    </Typography>
  );

  return (
    // Heading and description draw immediately; only the list holds space and
    // fills in. A full-page spinner here would discard structure already known
    // to be correct.
    <Stack spacing={3}>
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <Typography variant="h5" component="h1" sx={{ flexGrow: 1 }}>
          Active sessions
        </Typography>

        {/* Manual rather than polled: another device signing in while this
            page is open is rare, and last_seen_at is throttled to one write a
            minute server-side, so polling could not be fresher anyway. */}
        <Button
          variant="text"
          disabled={loading || revoking !== null}
          onClick={() => void load()}
        >
          Refresh
        </Button>
      </Stack>

      <Typography color="text.secondary">
        Every device signed in to your account. If you do not recognise one,
        sign it out and change your password.
      </Typography>

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

      <Link component={RouterLink} to="/account">
        Back to account
      </Link>
    </Stack>
  );
}
