import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentSession } from '../api/types.gen';
import { browserTimeZone, organizationTimeZone } from '../lib/time-zone';
import { server } from '../test/setup';
import { outdatedRefusal, serveVersion } from '../test/version';
import { newVersionNow } from '../version/version-check';
import { AuthProvider } from './auth-provider';
import { useAuth } from './use-auth';

/** Sam's session, in an organization or in none. */
function session(
  organization: { name: string; timeZone: string } | null,
): CurrentSession {
  return {
    user: {
      id: 'user-sam',
      email: 'sam@example.com',
      name: 'Sam',
      emailVerified: true,
      locale: null,
    },
    organization: organization && {
      id: `org-${organization.name}`,
      name: organization.name,
      branding: {
        logoFileId: null,
        squareLogoFileId: null,
        accentColor: null,
        rail: 'dark',
        logoOnDocuments: true,
        expiryWarningDays: 90,
        expiryCriticalDays: 30,
      },
      deletionScheduledAt: null,
      deletionStage: null,
      timeZone: organization.timeZone,
    },
    permissions: [],
  };
}

const ALPHA = { name: 'Alpha Co', timeZone: 'Asia/Shanghai' };
const REID = { name: 'Reid Supply Co.', timeZone: 'America/Toronto' };

/**
 * GET /auth/me answering with each reply in turn, the last one from then
 * on: a session, null for signed out, 'down' for no answer at all, or
 * 'outdated' for this tab refused as older than the API (ADR-081).
 * Returns the requests, as they arrive.
 */
function answer(
  ...replies: (CurrentSession | null | 'down' | 'outdated')[]
): Request[] {
  const requests: Request[] = [];
  server.use(
    http.get('/api/v1/auth/me', ({ request }) => {
      requests.push(request);
      const reply = replies[Math.min(requests.length, replies.length) - 1];
      if (reply === 'down') return HttpResponse.error();
      if (reply === 'outdated') {
        return outdatedRefusal();
      }
      if (reply === null) {
        return HttpResponse.json({ message: 'Sign in' }, { status: 401 });
      }
      return HttpResponse.json(reply);
    }),
  );
  return requests;
}

/** What the page shows of the session. */
function Shown() {
  const { session, loading, error } = useAuth();
  if (loading) return null;
  if (error) return <p>Could not reach the server</p>;
  if (!session) return <p>Signed out</p>;
  return <p>{session.organization?.name ?? 'No organization'}</p>;
}

function renderProvider() {
  return render(
    <AuthProvider>
      <Shown />
    </AuthProvider>,
  );
}

/** The person comes back to this window. */
function focusWindow() {
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
}

/**
 * The page is hidden, or shown again, as a phone's tab is going to the
 * background and coming back. Vitest restores the visibility after each test.
 */
function setVisibility(state: DocumentVisibilityState) {
  vi.spyOn(document, 'visibilityState', 'get').mockReturnValue(state);
  act(() => {
    document.dispatchEvent(new Event('visibilitychange'));
  });
}

/**
 * Spies on what the provider listens for, and returns a wait until it
 * listens. It adds its listeners from an effect, which can run after the
 * session is already on screen: a focus or a visibility change before then
 * goes unheard, and the read a test waits for never starts.
 */
function watchListeners(): () => Promise<void> {
  const onWindow = vi.spyOn(window, 'addEventListener');
  const onDocument = vi.spyOn(document, 'addEventListener');
  return () =>
    waitFor(() => {
      expect(onWindow).toHaveBeenCalledWith('focus', expect.any(Function));
      expect(onDocument).toHaveBeenCalledWith(
        'visibilitychange',
        expect.any(Function),
      );
    });
}

describe('AuthProvider', () => {
  // ADR-072's watch list: the organization's zone decides its day.
  it('passes the organization’s zone on, as the session changes', async () => {
    const requests = answer(session(ALPHA), session(REID), null);
    const listening = watchListeners();
    renderProvider();

    expect(await screen.findByText('Alpha Co')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe('Asia/Shanghai');

    // Each step waits for the listener, then the read, then its answer,
    // never for a time.
    await listening();
    focusWindow();
    await waitFor(() => expect(requests).toHaveLength(2));
    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe('America/Toronto');

    focusWindow();
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe(browserTimeZone());
  });

  // #144: another device joined an organization while this one was open.
  it('reads the session again when the window regains focus, in the background', async () => {
    const requests = answer(session(null), session(REID));
    const listening = watchListeners();
    renderProvider();
    expect(await screen.findByText('No organization')).toBeInTheDocument();
    await listening();

    focusWindow();

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(requests[0].headers.get('X-Background')).toBeNull();
    expect(requests[1].headers.get('X-Background')).toBe('1');
  });

  it('reads once per focus, one read at a time', async () => {
    const requests = answer(session(ALPHA), session(REID));
    const listening = watchListeners();
    renderProvider();
    await screen.findByText('Alpha Co');
    await listening();
    const fetches = vi.spyOn(globalThis, 'fetch');

    focusWindow();
    focusWindow();
    expect(fetches).toHaveBeenCalledTimes(1);

    await screen.findByText('Reid Supply Co.');
    focusWindow();
    expect(fetches).toHaveBeenCalledTimes(2);
    await waitFor(() => expect(requests).toHaveLength(3));
  });

  // #144 on a phone: a tab coming back from the background gets no focus.
  it('reads the session again when the page becomes visible, one read with the focus beside it', async () => {
    const requests = answer(session(null), session(REID));
    const listening = watchListeners();
    renderProvider();
    await screen.findByText('No organization');
    await listening();
    const fetches = vi.spyOn(globalThis, 'fetch');

    setVisibility('hidden');
    expect(fetches).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(fetches).toHaveBeenCalledTimes(1);

    // Switching tabs on a computer brings the focus too: still one read.
    focusWindow();
    expect(fetches).toHaveBeenCalledTimes(1);

    await waitFor(() => expect(requests).toHaveLength(2));
    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(requests[1].headers.get('X-Background')).toBe('1');
  });

  it('reads nothing on focus while signed out', async () => {
    answer(null);
    const listens = vi.spyOn(window, 'addEventListener');
    const { rerender } = renderProvider();
    await screen.findByText('Signed out');
    // Signed out, the provider never listens, so there is no listener to
    // wait for. A render first runs the effects of the one before, so once
    // this one is done the provider has settled: a focus now is one it
    // would hear if it listened.
    rerender(
      <AuthProvider>
        <Shown />
      </AuthProvider>,
    );
    expect(listens).not.toHaveBeenCalledWith('focus', expect.any(Function));
    const fetches = vi.spyOn(globalThis, 'fetch');

    focusWindow();

    expect(fetches).not.toHaveBeenCalled();
  });

  it('keeps the session it had when a read on focus finds nothing changed', async () => {
    const requests = answer(session(ALPHA));
    const listening = watchListeners();
    const seen: (CurrentSession | null)[] = [];
    function Watch() {
      const { session: current, loading } = useAuth();
      if (!loading) seen.push(current);
      return null;
    }
    render(
      <AuthProvider>
        <Watch />
      </AuthProvider>,
    );
    await waitFor(() => expect(seen).not.toHaveLength(0));
    await listening();
    const renders = seen.length;
    const fetches = vi.spyOn(globalThis, 'fetch');

    focusWindow();
    await waitFor(() => expect(requests).toHaveLength(2));
    // As below: the read's answer, then the microtasks that finish with it.
    const read = fetches.mock.results[0];
    if (read?.type !== 'return') throw new Error('The focus started no read');
    await act(() => read.value.then(() => undefined));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    // Nothing reading the session rendered again.
    expect(seen).toHaveLength(renders);
  });

  it('keeps the page as it was when a read on focus finds no server', async () => {
    const requests = answer(session(ALPHA), 'down', session(REID));
    const listening = watchListeners();
    renderProvider();
    await screen.findByText('Alpha Co');
    await listening();
    const fetches = vi.spyOn(globalThis, 'fetch');

    focusWindow();
    await waitFor(() => expect(requests).toHaveLength(2));
    // The read finds no server: wait for its fetch to fail. The provider
    // finishes with it in the microtasks that follow, which a timer's turn
    // drains, and is then free to read again.
    const read = fetches.mock.results[0];
    if (read?.type !== 'return') throw new Error('The focus started no read');
    await act(() => read.value.catch(() => undefined));
    await act(() => new Promise((resolve) => setTimeout(resolve, 0)));

    expect(screen.getByText('Alpha Co')).toBeInTheDocument();
    expect(
      screen.queryByText('Could not reach the server'),
    ).not.toBeInTheDocument();

    // Still listening, and free to read again.
    focusWindow();
    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
  });
});

describe('AuthProvider, for a tab the API refuses as outdated (ADR-081)', () => {
  /** What after an action reads the session again, and a sign-out. */
  function Actions() {
    const { refresh, signedOut } = useAuth();
    return (
      <>
        <button type="button" onClick={() => void refresh()}>
          Read again
        </button>
        <button type="button" onClick={signedOut}>
          Signed out
        </button>
      </>
    );
  }

  function renderWithActions() {
    render(
      <AuthProvider>
        <Shown />
        <Actions />
      </AuthProvider>,
    );
  }

  it('leaves the app as it is when a read after an action is refused, and makes the new version urgent', async () => {
    serveVersion();
    const requests = answer(session(ALPHA), 'outdated');
    renderWithActions();
    await screen.findByText('Alpha Co');

    await userEvent.click(screen.getByRole('button', { name: 'Read again' }));
    await waitFor(() => expect(requests).toHaveLength(2));
    await waitFor(() => expect(newVersionNow().urgent).toBe(true));

    // Neither signed out nor the boot screen, whose Try again would meet
    // the same refusal.
    expect(screen.getByText('Alpha Co')).toBeInTheDocument();
    expect(
      screen.queryByText('Could not reach the server'),
    ).not.toBeInTheDocument();
  });

  it('ends the session at a sign-out without reading it, since the read would be refused', async () => {
    const requests = answer(session(ALPHA), 'outdated');
    renderWithActions();
    await screen.findByText('Alpha Co');

    await userEvent.click(screen.getByRole('button', { name: 'Signed out' }));
    expect(
      screen.getByText('Signed out', { selector: 'p' }),
    ).toBeInTheDocument();
    expect(requests).toHaveLength(1);
  });
});
