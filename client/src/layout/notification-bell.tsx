import NotificationsNoneIcon from '@mui/icons-material/NotificationsNone';
import {
  Alert,
  Badge,
  Box,
  Button,
  Divider,
  IconButton,
  Menu,
  MenuItem,
  Stack,
  Tooltip,
  Typography,
} from '@mui/material';
import { type MouseEvent, useState } from 'react';
import { useIntl } from 'react-intl';
import { useNavigate } from 'react-router-dom';

import type { Notification } from '../api/types.gen';
import { ReferencesWhole } from '../components/reference';
import { Reload } from '../errors/status-actions';
import { api, isRevisionRefusal } from '../lib/api';
import { relativeTime } from '../lib/format';
import { useFailureWords } from '../lib/use-failure-words';
import { useWhileVisible } from '../lib/use-while-visible';
import { rem } from '../theme/rem';
import { useNewVersion } from '../version/version-check';

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
    // Licences have no page of their own: the list, where it is (ADR-064).
    case 'product_licence':
      return '/licences';
    // Someone the reader invited has joined: their page on People (ADR-079).
    case 'user':
      return `/people/${entry.resourceId}`;
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
 *
 * Nothing at all while the API refuses this tab as outdated (ADR-081):
 * every ask would be refused, and each a line in the log. A reload, from
 * the new version, asks again.
 */
export function NotificationBell() {
  const intl = useIntl();
  const navigate = useNavigate();

  const [anchor, setAnchor] = useState<HTMLElement | null>(null);
  const [count, setCount] = useState(0);
  const [entries, setEntries] = useState<Notification[] | null>(null);
  const [failure, setFailure] = useState<unknown>(null);
  const { newer, outdated } = useNewVersion();
  const refusalWords = useFailureWords(
    isRevisionRefusal(failure) ? failure : null,
  );

  async function askCount() {
    try {
      // Marked as background (ADR-063): the bell asking moves neither the
      // person's last active nor their session's idle timer.
      const { count: unread } = await api<{ count: number }>(
        '/notifications/unread-count',
        { headers: { 'X-Background': '1' } },
      );
      setCount(unread);
    } catch {
      // Silent. A bell that cannot reach the server should look like a bell
      // with nothing in it, not an error on every page in the app.
    }
  }

  // Only while the tab is seen, and at once when it is seen again, so the
  // count is right when looked at (ADR-063).
  useWhileVisible(outdated ? null : askCount, POLL_MS);

  async function load() {
    setEntries(null);
    setFailure(null);

    try {
      const page = await api<{ entries: Notification[] }>('/notifications');
      setEntries(page.entries);
    } catch (caught) {
      // Said, never shown as an empty list (#189): "Nothing yet." would
      // tell someone with notifications that they have none.
      setFailure(caught);
    }
  }

  function open(event: MouseEvent<HTMLElement>) {
    setAnchor(event.currentTarget);
    void load();
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

  const title = intl.formatMessage({
    id: 'layout.notifications.title',
    defaultMessage: 'Notifications',
  });

  return (
    <>
      <Tooltip title={title}>
        <IconButton
          aria-label={
            count > 0
              ? intl.formatMessage(
                  {
                    id: 'layout.notifications.unread',
                    defaultMessage: 'Notifications, {count} unread',
                  },
                  { count },
                )
              : title
          }
          onClick={open}
        >
          {/* Nothing rather than 0: a Badge hiding a 0 still holds the
              last number it showed, once anything around it renders
              again, and text in the button that its name does not say
              fails Label in Name (WCAG 2.5.3). */}
          <Badge badgeContent={count || undefined} color="error" max={99}>
            <NotificationsNoneIcon />
          </Badge>
        </IconButton>
      </Tooltip>

      <Menu
        anchorEl={anchor}
        open={anchor !== null}
        onClose={() => setAnchor(null)}
        slotProps={{ paper: { sx: { width: rem(380), maxHeight: 480 } } }}
      >
        <Stack
          direction="row"
          spacing={2}
          sx={{ alignItems: 'center', px: 2, py: 1 }}
        >
          <Typography variant="subtitle2" sx={{ flexGrow: 1 }}>
            {title}
          </Typography>

          {count > 0 && (
            <Button size="small" variant="text" onClick={() => void readAll()}>
              {intl.formatMessage({
                id: 'layout.notifications.markAllRead',
                defaultMessage: 'Mark all read',
              })}
            </Button>
          )}
        </Stack>

        <Divider />

        {failure !== null && (
          <Box sx={{ px: 2, py: 1 }}>
            {refusalWords ? (
              // An outdated tab (ADR-081): asking again would be refused
              // again, so Reload once the new version is out, and nothing
              // while it is still being installed.
              <Alert severity="warning" action={newer ? <Reload /> : null}>
                {refusalWords}
              </Alert>
            ) : (
              <Alert
                severity="error"
                action={
                  <Button variant="text" onClick={() => void load()}>
                    {intl.formatMessage({
                      id: 'common.tryAgain',
                      defaultMessage: 'Try again',
                    })}
                  </Button>
                }
              >
                {intl.formatMessage({
                  id: 'layout.notifications.loadFailed',
                  defaultMessage: 'Could not load notifications.',
                })}
              </Alert>
            )}
          </Box>
        )}

        {entries === null && failure === null && (
          <MenuItem disabled>
            <Typography variant="body2">
              {intl.formatMessage({
                id: 'common.loading',
                defaultMessage: 'Loading…',
              })}
            </Typography>
          </MenuItem>
        )}

        {entries?.length === 0 && (
          <MenuItem disabled>
            <Typography variant="body2">
              {intl.formatMessage({
                id: 'layout.notifications.empty',
                defaultMessage: 'Nothing yet.',
              })}
            </Typography>
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
                {/* The server's words: its SKU or licence number kept
                    whole by its hyphens (ADR-081). */}
                <ReferencesWhole text={entry.title} />
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
