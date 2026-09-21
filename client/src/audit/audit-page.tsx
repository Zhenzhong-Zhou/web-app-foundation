import {
  Alert,
  Button,
  MenuItem,
  Paper,
  Skeleton,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { PageHeader } from '../components/page-header';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  type AuditPageResponse,
  type AuditRecord,
  describe,
  summarise,
} from './audit-format';

/**
 * Sent explicitly rather than taking the server's default.
 *
 * The API defaults to 50, which is a reasonable API default and a long first
 * screen. It also has to stay explicit for the paging test to mean anything:
 * with no limit, any log short of 50 entries fits on one page and the cursor
 * is never exercised.
 */
const PAGE_SIZE = 25;

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}

export function AuditPage() {
  const { session } = useAuth();

  /**
   * Filters live in the URL rather than in state, so a filtered view is
   * shareable and the History links on detail pages are just links —
   * `/audit?resourceId=…` needs no second mechanism to be read.
   */
  const [params, setParams] = useSearchParams();

  const action = params.get('action') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const resourceId = params.get('resourceId') ?? '';

  const [entries, setEntries] = useState<AuditRecord[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [actions, setActions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const canView = !!session?.permissions.includes('audit.view');
  const loading = entries === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  /** The filters as the API wants them, shared by the load and Load more. */
  function queryFor(before?: string): string {
    const query = new URLSearchParams({ limit: String(PAGE_SIZE) });

    if (action) query.set('action', action);
    if (resourceId) query.set('resourceId', resourceId);
    // The date input gives YYYY-MM-DD; the API takes ISO timestamps.
    if (from) query.set('from', new Date(from).toISOString());
    if (to) query.set('to', new Date(to).toISOString());
    if (before) query.set('before', before);

    return query.toString();
  }

  /**
   * Setting a filter drops the cursor: a `before` from the previous filter
   * points at a row that may not be in the new result at all.
   *
   * replace, so changing a filter four times leaves one entry in the back
   * stack rather than four.
   */
  function changeFilter(patch: Record<string, string>) {
    const next = new URLSearchParams(params);

    for (const [key, value] of Object.entries(patch)) {
      if (value) {
        next.set(key, value);
      } else {
        next.delete(key);
      }
    }

    setEntries(null);
    setParams(next, { replace: true });
  }

  /**
   * The action vocabulary, from the log rather than a constant: the client
   * cannot import the server's AUDIT_ACTIONS, and a duplicated list drifts.
   * It also offers only what has happened, so the filter never contains an
   * option that returns nothing.
   */
  useEffect(() => {
    if (!canView) return;

    let ignore = false;

    void api<string[]>('/audit/actions')
      .then((rows) => {
        if (!ignore) setActions(rows);
      })
      // A failed vocabulary costs the filter, not the log. The banner below is
      // reserved for the entries themselves.
      .catch(() => undefined);

    return () => {
      ignore = true;
    };
  }, [canView]);

  useEffect(() => {
    if (!canView) return;

    let ignore = false;

    void api<AuditPageResponse>(`/audit?${queryFor()}`)
      .then((page) => {
        if (ignore) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
        setError(null);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canView, action, from, to, resourceId]);

  async function loadMore() {
    if (!cursor) return;

    setLoadingMore(true);

    try {
      const page = await api<AuditPageResponse>(`/audit?${queryFor(cursor)}`);
      setEntries((current) => [...(current ?? []), ...page.entries]);
      setCursor(page.nextCursor);
    } catch (caught) {
      setError(messageFor(caught));
    } finally {
      setLoadingMore(false);
    }
  }

  if (!canView) {
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
      <PageHeader
        crumbs={[]}
        title="Audit log"
        subtitle="Every change made in this organization, newest first. Entries are kept for two years and cannot be edited or removed. Where a value is shown, it is what the field was set to — not what it was before."
      />

      {/* Their own row rather than beside the title: three controls crowd a
          heading, and an actor filter is the obvious next one. */}
      <Stack direction="row" spacing={2} sx={{ alignItems: 'center' }}>
        <TextField
          id="audit-action"
          label="Action"
          select
          size="small"
          value={action}
          onChange={(event) => changeFilter({ action: event.target.value })}
          sx={{ minWidth: 220 }}
        >
          <MenuItem value="">All actions</MenuItem>
          {actions.map((key) => (
            <MenuItem key={key} value={key}>
              {describe(key)}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          id="audit-from"
          label="From"
          type="date"
          size="small"
          value={from}
          onChange={(event) => changeFilter({ from: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />

        <TextField
          id="audit-to"
          label="To"
          type="date"
          size="small"
          value={to}
          onChange={(event) => changeFilter({ to: event.target.value })}
          slotProps={{ inputLabel: { shrink: true } }}
        />
      </Stack>

      {/* A UUID in the query string is invisible, and a log filtered to one
          record looks broken rather than filtered. */}
      {resourceId && (
        <Alert
          severity="info"
          action={
            <Button
              size="small"
              onClick={() => changeFilter({ resourceId: '' })}
            >
              Show all
            </Button>
          }
        >
          Showing one record only.
        </Alert>
      )}

      {error && <Alert severity="error">{error}</Alert>}

      {loading && showSkeleton && <Skeleton height={200} />}

      {entries?.length === 0 && (
        <Alert severity="info">
          {action || from || to || resourceId
            ? 'Nothing matches these filters.'
            : 'Nothing recorded yet.'}
        </Alert>
      )}

      {!!entries?.length && (
        <>
          <Paper variant="outlined">
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
                    <TableCell>
                      {describe(entry.action)}
                      {/* component="div": the default <p> inside a cell
                          alongside text is invalid markup. */}
                      {summarise(entry.payload) && (
                        <Typography
                          variant="caption"
                          component="div"
                          color="text.secondary"
                        >
                          {summarise(entry.payload)}
                        </Typography>
                      )}
                    </TableCell>

                    <TableCell>
                      {/* A tombstoned actor keeps its id and loses its email
                          (ADR-012). The row stays, which is the point. */}
                      {entry.actorEmail ?? 'A removed account'}
                    </TableCell>

                    <TableCell>{relativeTime(entry.createdAt)}</TableCell>
                    <TableCell>{entry.ip ?? '—'}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>

          {cursor && (
            <Button
              variant="text"
              disabled={loadingMore}
              onClick={() => void loadMore()}
            >
              {loadingMore ? 'Loading…' : 'Load more'}
            </Button>
          )}
        </>
      )}
    </Stack>
  );
}
