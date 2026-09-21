import CloseIcon from '@mui/icons-material/Close';
import {
  Alert,
  Box,
  Button,
  Divider,
  Drawer,
  IconButton,
  Link,
  List,
  ListItem,
  Skeleton,
  Stack,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { Link as RouterLink } from 'react-router-dom';

import { useAuth } from '../auth/use-auth';
import { api, ApiError } from '../lib/api';
import { relativeTime } from '../lib/format';
import { openDialog } from '../lib/open-dialog';
import { useDelayedFlag } from '../lib/use-delayed-flag';
import {
  type AuditPageResponse,
  type AuditRecord,
  describe,
  summarise,
} from './audit-format';

/** A drawer's worth. The full log is one link away for anything longer. */
const PAGE_SIZE = 20;

/**
 * "What happened to this one", without leaving it.
 *
 * A drawer rather than a link to the audit page: the page you are on already
 * says which product or order this is, and navigating away to a log that
 * cannot say it trades the context for nothing. A drawer rather than a
 * dialog, because the record stays visible beside its history — "SKU changed
 * to RENAMED-1" is read against the SKU on screen.
 *
 * The audit page stays, and the drawer links to it. It answers a different
 * question — what happened across the organization — and owns the filters,
 * the dates and the long tail. This shows the recent changes to one record
 * and stops.
 *
 * Fetched on every open rather than once: the likeliest reason to open it is
 * having just changed something, and a cached history would not include it.
 *
 * Hidden without audit.view rather than disabled. The API would refuse the
 * request, and a disabled control asks a question only an admin can answer.
 */
export function HistoryButton({ resourceId }: { resourceId: string }) {
  const { session } = useAuth();
  const [open, setOpen] = useState(false);

  if (!session?.permissions.includes('audit.view')) return null;

  return (
    <>
      {/* A Drawer is a Modal: it hides #root the same way a Dialog does. */}
      <Button variant="text" onClick={openDialog(() => setOpen(true))}>
        History
      </Button>

      <Drawer
        anchor="right"
        open={open}
        onClose={() => setOpen(false)}
        slotProps={{ paper: { sx: { width: { xs: '100%', sm: 420 } } } }}
      >
        {/* Mounted only while open, so each open starts from nothing and
            fetches fresh — no stale list flashing before the new one. */}
        {open && (
          <HistoryPanel
            resourceId={resourceId}
            onClose={() => setOpen(false)}
          />
        )}
      </Drawer>
    </>
  );
}

function HistoryPanel({
  resourceId,
  onClose,
}: {
  resourceId: string;
  onClose: () => void;
}) {
  const [entries, setEntries] = useState<AuditRecord[] | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  const loading = entries === null && error === null;
  const showSkeleton = useDelayedFlag(loading);

  function queryFor(before?: string): string {
    const query = new URLSearchParams({
      resourceId,
      limit: String(PAGE_SIZE),
    });
    if (before) query.set('before', before);
    return query.toString();
  }

  useEffect(() => {
    let ignore = false;

    void api<AuditPageResponse>(`/audit?${queryFor()}`)
      .then((page) => {
        if (ignore) return;
        setEntries(page.entries);
        setCursor(page.nextCursor);
      })
      .catch((caught: unknown) => {
        if (!ignore) setError(messageFor(caught));
      });

    return () => {
      ignore = true;
    };
    // queryFor reads only resourceId, which is the dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId]);

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

  return (
    <Stack sx={{ height: '100%' }}>
      <Stack
        direction="row"
        sx={{ alignItems: 'center', px: 2, py: 1.5, gap: 1 }}
      >
        <Typography variant="h6" component="h2" sx={{ flexGrow: 1 }}>
          History
        </Typography>
        <IconButton aria-label="Close history" onClick={onClose}>
          <CloseIcon />
        </IconButton>
      </Stack>

      <Divider />

      <Box sx={{ flexGrow: 1, overflowY: 'auto', px: 2, py: 1 }}>
        {error && <Alert severity="error">{error}</Alert>}

        {loading && showSkeleton && <Skeleton height={160} />}

        {entries?.length === 0 && (
          // Not an error. Changes made before auditing covered this record,
          // or before its variant and receipt events were keyed to it, have
          // no rows here.
          <Typography variant="body2" color="text.secondary" sx={{ py: 2 }}>
            No recorded changes.
          </Typography>
        )}

        {!!entries?.length && (
          <List disablePadding>
            {entries.map((entry) => (
              <ListItem
                key={entry.id}
                disableGutters
                divider
                sx={{ display: 'block', py: 1.25 }}
              >
                <Typography variant="body2">
                  {describe(entry.action)}
                </Typography>

                {summarise(entry.payload) && (
                  <Typography variant="body2" color="text.secondary">
                    {summarise(entry.payload)}
                  </Typography>
                )}

                <Typography variant="caption" color="text.secondary">
                  {/* A tombstoned actor keeps its id and loses its email
                      (ADR-012). */}
                  {entry.actorEmail ?? 'A removed account'} ·{' '}
                  {relativeTime(entry.createdAt)}
                </Typography>
              </ListItem>
            ))}
          </List>
        )}

        {cursor && (
          <Button
            variant="text"
            disabled={loadingMore}
            onClick={() => void loadMore()}
            sx={{ mt: 1 }}
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </Button>
        )}
      </Box>

      <Divider />

      {/* The way out to the tools this deliberately leaves out: dates,
          actions, IPs, everything else in the organization. */}
      <Box sx={{ px: 2, py: 1.5 }}>
        <Link
          component={RouterLink}
          to={`/audit?${new URLSearchParams({ resourceId }).toString()}`}
          variant="body2"
          underline="hover"
        >
          Open in audit log
        </Link>
      </Box>
    </Stack>
  );
}

function messageFor(caught: unknown): string {
  return caught instanceof ApiError
    ? caught.message
    : 'Could not reach the server.';
}
