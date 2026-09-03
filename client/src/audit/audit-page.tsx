import {
  Alert,
  Button,
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

import { ApiError, api } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';

interface AuditRecord {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  actorId: string | null;
  /** Joined server-side: a tombstoned actor is not in GET /v1/users. */
  actorEmail: string | null;
  ip: string | null;
  createdAt: string;
}

interface AuditPage {
  entries: AuditRecord[];
  /** Pass as `before` for the next page. Null when the log is exhausted. */
  nextCursor: string | null;
}

const PAGE_SIZE = 25;

/**
 * Falls back to the raw action string for anything unlisted, so an action
 * added server-side renders as `user.deleted` rather than as a wrong label or
 * a blank cell. That fallback is what makes the map safe to have at all.
 */
const ACTION_LABELS: Record<string, string> = {
  'user.created': 'Added a member',
  'user.role_changed': "Changed a member's role",
};

function describe(action: string): string {
  return ACTION_LABELS[action] ?? action;
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function AuditPage() {
  const [entries, setEntries] = useState<AuditRecord[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  const loading = entries === null && error === null && !forbidden;
  const showSkeleton = useDelayedFlag(loading);

  useEffect(() => {
    let ignore = false;

    void api<AuditPage>(`/audit?limit=${PAGE_SIZE}`)
      .then((page) => {
        if (ignore) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        // Its own state, not an alert: a heading promising "every change made
        // in this organization" above a message saying you may not see it is
        // two contradictory claims on one screen.
        if (caught instanceof ApiError && caught.status === 403) {
          setForbidden(true);
          return;
        }
        setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
  }, []);

  async function loadMore() {
    if (!cursor) return;

    setLoadingMore(true);
    setError(null);

    try {
      const page = await api<AuditPage>(
        `/audit?limit=${PAGE_SIZE}&before=${cursor}`,
      );

      // Appended, never replaced. A keyset cursor pages forward through a
      // fixed sequence — refetching page one would show rows the reader has
      // already passed, and there is no page number to return to.
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  if (forbidden) {
    return (
      <Stack spacing={2}>
        <Typography variant="h5" component="h1">
          Audit log
        </Typography>
        <Alert severity="info">
          Your role does not include access to the audit log.
        </Alert>
      </Stack>
    );
  }

  return (
    <Stack spacing={3}>
      <Typography variant="h5" component="h1">
        Audit log
      </Typography>

      <Typography color="text.secondary">
        Every change made in this organization, newest first. Entries are kept
        for two years and cannot be edited or removed.
      </Typography>

      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined">
        {loading ? (
          <Stack sx={{ p: 2 }} spacing={1}>
            {showSkeleton ? (
              <>
                <Skeleton height={48} />
                <Skeleton height={48} />
                <Skeleton height={48} />
              </>
            ) : null}
          </Stack>
        ) : entries?.length ? (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>Action</TableCell>
                <TableCell>By</TableCell>
                <TableCell>When</TableCell>
                <TableCell>From</TableCell>
              </TableRow>
            </TableHead>

            <TableBody>
              {entries.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell>{describe(entry.action)}</TableCell>
                  <TableCell>
                    {/* Null when the actor was anonymised (ADR-012). The row
                        survives its author, which is the point of RESTRICT on
                        actor_id. */}
                    {entry.actorEmail ?? 'Deleted user'}
                  </TableCell>
                  <TableCell>
                    <span title={new Date(entry.createdAt).toLocaleString()}>
                      {relativeTime(entry.createdAt)}
                    </span>
                  </TableCell>
                  <TableCell>{entry.ip ?? '—'}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        ) : (
          <Typography color="text.secondary" sx={{ p: 3 }}>
            Nothing recorded yet.
          </Typography>
        )}
      </Paper>

      {/* Load more, not page numbers: a keyset cursor has no notion of "page
          4", and that is deliberate — offset paging repeats rows as new
          entries arrive at the head (ADR-018). */}
      {cursor && (
        <Button
          variant="text"
          onClick={() => void loadMore()}
          disabled={loadingMore}
          sx={{ alignSelf: 'flex-start' }}
        >
          {loadingMore ? 'Loading…' : 'Load more'}
        </Button>
      )}
    </Stack>
  );
}
