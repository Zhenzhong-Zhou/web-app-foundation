import {
  Alert,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
} from '@mui/material';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useIntl } from 'react-intl';

import { useAuth } from '../auth/use-auth';
import { api } from '../lib/api';
import { SIGNED_OUT_REASON } from '../lib/session-keys';
import { hasUnsavedChanges } from '../lib/unsaved-registry';
import { newVersionNow } from '../version/version-check';

/** How long before the limit the warning shows. */
const WARN_MS = 60_000;
/** While active, the page tells the server at most this often. */
const PING_MS = 60_000;
/** What counts as activity: not the mouse moving on its own (ADR-065). */
const ACTIVITY = ['click', 'keydown', 'scroll', 'wheel', 'touchstart'] as const;
/** Where every tab of the app hears the others. */
const CHANNEL = 'waf-session';

/**
 * Tells the server the person is active, a real request, so its idle timer
 * agrees with this one. Not while the API refuses this tab as outdated
 * (ADR-081): refused before the session is read, it would extend nothing,
 * and be a line in the log each minute, as the bell's ask would.
 */
function ping() {
  if (newVersionNow().outdated) return;
  void api('/auth/me').catch(() => undefined);
}

/**
 * Signs out after the session's idle limit, when it has one short enough
 * to warn about (ADR-065): not kept, or under the organization's policy.
 * Every tab counts as one: activity in any keeps all, a sign-out in one
 * signs out all. A minute before, a dialog with Stay signed in, which has
 * the focus, and the countdown in the tab's title. The server holds the
 * limit anyway; this only makes it visible and polite.
 */
export function IdleGuard() {
  const intl = useIntl();
  const { session, signedOut } = useAuth();
  const limit = session?.idleLimitMs ?? null;
  const [left, setLeft] = useState<number | null>(null);
  // Set to now when the timer starts, in the effect: not during render.
  const last = useRef(0);
  const pinged = useRef(0);
  const posted = useRef(0);
  const channel = useRef<BroadcastChannel | null>(null);

  const signOut = useCallback(
    async (here: boolean) => {
      window.sessionStorage.setItem(
        SIGNED_OUT_REASON,
        String(Math.round((limit ?? 0) / 60_000)),
      );
      if (here) {
        channel.current?.postMessage({ type: 'signed-out' });
        await api('/auth/logout', { method: 'POST' }).catch(() => undefined);
      }
      // No session: the app's guard sends this tab to the sign-in page,
      // and remembers where it was. Not read again, since an outdated
      // tab's read would be refused (ADR-081); the server ends a session
      // left past its limit anyway.
      signedOut();
    },
    [limit, signedOut],
  );

  const stay = useCallback(() => {
    last.current = Date.now();
    pinged.current = Date.now();
    setLeft(null);
    channel.current?.postMessage({ type: 'active', at: last.current });
    ping();
  }, []);

  useEffect(() => {
    if (!limit) return;
    last.current = Date.now();
    pinged.current = Date.now();
    const bus =
      'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL) : null;
    channel.current = bus;

    const onActivity = () => {
      const now = Date.now();
      last.current = now;
      setLeft(null);
      // Told to the other tabs and the server, but not on every scroll.
      if (now - posted.current > 5_000) {
        posted.current = now;
        bus?.postMessage({ type: 'active', at: now });
      }
      if (now - pinged.current > PING_MS) {
        pinged.current = now;
        ping();
      }
    };
    const onMessage = (event: MessageEvent<{ type: string; at?: number }>) => {
      if (event.data.type === 'active' && event.data.at) {
        last.current = Math.max(last.current, event.data.at);
        setLeft(null);
      }
      if (event.data.type === 'signed-out') void signOut(false);
    };

    for (const name of ACTIVITY) {
      window.addEventListener(name, onActivity, {
        passive: true,
        capture: true,
      });
    }
    bus?.addEventListener('message', onMessage);
    const timer = window.setInterval(() => {
      const remaining = limit - (Date.now() - last.current);
      if (remaining <= 0) void signOut(true);
      else setLeft(remaining <= WARN_MS ? remaining : null);
    }, 1000);

    return () => {
      for (const name of ACTIVITY) {
        window.removeEventListener(name, onActivity, { capture: true });
      }
      bus?.removeEventListener('message', onMessage);
      bus?.close();
      channel.current = null;
      window.clearInterval(timer);
    };
  }, [limit, signOut]);

  // The countdown in the tab's title too, for someone in another window.
  const countdown =
    left === null
      ? null
      : `${Math.floor(left / 60_000)}:${String(Math.ceil((left % 60_000) / 1000) % 60).padStart(2, '0')}`;
  useEffect(() => {
    if (countdown === null) return;
    const original = document.title;
    document.title = `(${countdown}) ${intl.formatMessage({
      id: 'idle.title',
      defaultMessage: 'Signing out…',
    })} · ${original}`;
    return () => {
      document.title = original;
    };
  }, [countdown, intl]);

  if (!limit || countdown === null) return null;
  const minutes = Math.round(limit / 60_000);

  return (
    <Dialog open role="alertdialog" aria-labelledby="idle-title">
      <DialogTitle id="idle-title">
        {intl.formatMessage(
          {
            id: 'idle.heading',
            defaultMessage: 'You’ll be signed out in {countdown}',
          },
          { countdown },
        )}
      </DialogTitle>
      <DialogContent>
        {intl.formatMessage(
          {
            id: 'idle.why',
            defaultMessage:
              'No activity for a while. This computer signs out after {duration} without use, so nobody else works as you.',
          },
          {
            duration:
              minutes < 60
                ? intl.formatMessage(
                    {
                      id: 'settings.security.minutes',
                      defaultMessage:
                        '{count, plural, one {# minute} other {# minutes}}',
                    },
                    { count: minutes },
                  )
                : intl.formatMessage(
                    {
                      id: 'settings.security.hours',
                      defaultMessage:
                        '{count, plural, one {# hour} other {# hours}}',
                    },
                    { count: minutes / 60 },
                  ),
          },
        )}
        {hasUnsavedChanges() && (
          <Alert severity="warning" sx={{ mt: 2 }}>
            {intl.formatMessage({
              id: 'idle.unsaved',
              defaultMessage: 'Your unsaved changes on this page will be lost.',
            })}
          </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => void signOut(true)}>
          {intl.formatMessage({
            id: 'layout.signOut',
            defaultMessage: 'Sign out',
          })}
        </Button>
        <Button variant="contained" autoFocus onClick={stay}>
          {intl.formatMessage({
            id: 'idle.stay',
            defaultMessage: 'Stay signed in',
          })}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
