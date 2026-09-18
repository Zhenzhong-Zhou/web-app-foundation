import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import {
  Badge,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { relativeTime } from '../lib/format';

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  resourceType: string | null;
  resourceId: string | null;
  readAt: string | null;
  createdAt: string;
}

/** How often the badge re-checks while the app is open. */
const POLL_MS = 60_000;

/**
 * Where a notification takes you. Null when there is nowhere to go — an
 * account notification has no row to open, and the sessions page is the
 * closest thing rather than the subject.
 */
function linkFor(entry: Notification): string | null {
  if (!entry.resourceId) return null;

  switch (entry.resourceType) {
    case 'order':
      return `/orders/${entry.resourceId}`;
    case 'production_order':
      return `/production/${entry.resourceId}`;
    default:
      return null;
  }
}

/**
 * The bell (ADR-036).
 *
 * Polls the count rather than the list: the badge is wanted on every page and
 * the list only when the menu opens, so folding them would fetch twenty rows
 * a minute to render a number.
 *
 * A minute, not a second. Nothing here is time-critical — a variance flagged
 * at close and a sign-in from an unfamiliar browser are both worth knowing
 * within the minute, and neither is worth a socket.
 */
export function NotificationBell() {
  const navigate = useNavigate();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const [entries, setEntries] = useState<Notification[] | null>(null);

  useEffect(() => {
    let ignore = false;

    /**
     * Inline rather than a useCallback the effect calls: setState reached
     * synchronously from an effect body triggers cascading renders, and the
     * guard has to sit after the await either way.
     */
    async function tick() {
      try {
        const { count: unread } = await api<{ count: number }>(
          '/notifications/unread-count',
        );
        if (!ignore) setCount(unread);
      } catch {
        // Silent. A bell that cannot reach the server should look like a bell
        // with nothing in it, not an error on every page in the app.
      }
    }

    void tick();
    const timer = setInterval(() => void tick(), POLL_MS);

    return () => {
      ignore = true;
      clearInterval(timer);
    };
  }, []);

  async function open(event: React.MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
    setEntries(null);

    try {
      const page = await api<{ entries: Notification[] }>('/notifications');
      setEntries(page.entries);
    } catch {
      setEntries([]);
    }
  }

  async function choose(entry: Notification) {
    setAnchor(null);

    if (!entry.readAt) {
      // Optimistic: the badge should drop the moment it is clicked, and a
      // failed write means one stale count for up to a minute.
      setCount((current) => Math.max(0, current - 1));
      await api(`/notifications/${entry.id}/read`, { method: 'POST' }).catch(
        () => undefined,
      );
    }

    const to = linkFor(entry);
    if (to) navigate(to);
  }

  async function readAll() {
    setCount(0);
    setEntries(
      (current) =>
        current?.map((entry) => ({
          ...entry,
          readAt: entry.readAt ?? new Date().toISOString(),
        })) ?? null,
    );

    await api('/notifications/read-all', { method: 'POST' }).catch(
      () => undefined,
    );
  }

  return (
    <>
      <Tooltip title="Notifications">
        <IconButton
          aria-label={
            count > 0 ? `Notifications, ${count} unread` : 'Notifications'
          }
          onClick={(event) => void open(event)}
        >
          <Badge badgeContent={count} color="error" max={99}>
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: 380, maxHeight: 480 } } }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', px: 2, py: 1 }}
        >
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            Notifications
          </Typography>

          {count > 0 && (
            <Button size="small" variant="text" onClick={() => void readAll()}>
              Mark all read
            </Button>
          )}
        </Stack>

        <Divider />

        {entries === null && (
          <MenuItem disabled>
            <Typography variant="body2">Loading…</Typography>
          </MenuItem>
        )}

        {entries?.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2">Nothing yet.</Typography>
          </MenuItem>
        )}

        {entries?.map((entry) => (
          <MenuItem
            key={entry.id}
            onClick={() => void choose(entry)}
            sx={{ whiteSpace: 'normal', alignItems: 'flex-start', py: 1.5 }}
          >
            <Stack spacing={0.25}>
              <Typography
                variant="body2"
                // Unread is the only state worth styling. A dot would need a
                // column of its own for one bit of information.
                sx={{ fontWeight: entry.readAt ? 400 : 600 }}
              >
                {entry.title}
              </Typography>

              {entry.body && (
                <Typography variant="caption" color="text.secondary">
                  {entry.body}
                </Typography>
              )}

              <Typography variant="caption" color="text.secondary">
                {relativeTime(entry.createdAt)}
              </Typography>
            </Stack>
          </MenuItem>
        ))}
      </Menu>
    </>
  );
}
