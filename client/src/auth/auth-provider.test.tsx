import { act, render, screen, waitFor } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { CurrentSession } from '../api/types.gen';
import { browserTimeZone, organizationTimeZone } from '../lib/time-zone';
import { server } from '../test/setup';
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
      roleId: 'role-viewer',
      branding: {
        logoFileId: null,
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
 * on: a session, null for signed out, or 'down' for no answer at all.
 * Returns the requests, as they arrive.
 */
function answer(...replies: (CurrentSession | null | 'down')[]): Request[] {
  const requests: Request[] = [];
  server.use(
    http.get('/api/v1/auth/me', ({ request }) => {
      requests.push(request);
      const reply = replies[Math.min(requests.length, replies.length) - 1];
      if (reply === 'down') return HttpResponse.error();
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

describe('AuthProvider', () => {
  // ADR-072's watch list: the organization's zone decides its day.
  it('passes the organization’s zone on, as the session changes', async () => {
    answer(session(ALPHA), session(REID), null);
    renderProvider();

    expect(await screen.findByText('Alpha Co')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe('Asia/Shanghai');

    focusWindow();
    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe('America/Toronto');

    focusWindow();
    expect(await screen.findByText('Signed out')).toBeInTheDocument();
    expect(organizationTimeZone()).toBe(browserTimeZone());
  });

  // #144: another device joined an organization while this one was open.
  it('reads the session again when the window regains focus, in the background', async () => {
    const requests = answer(session(null), session(REID));
    renderProvider();
    expect(await screen.findByText('No organization')).toBeInTheDocument();

    focusWindow();

    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(requests[0].headers.get('X-Background')).toBeNull();
    expect(requests[1].headers.get('X-Background')).toBe('1');
  });

  it('reads once per focus, one read at a time', async () => {
    const requests = answer(session(ALPHA), session(REID));
    renderProvider();
    await screen.findByText('Alpha Co');
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
    renderProvider();
    await screen.findByText('No organization');
    const fetches = vi.spyOn(globalThis, 'fetch');

    setVisibility('hidden');
    expect(fetches).not.toHaveBeenCalled();

    setVisibility('visible');
    expect(fetches).toHaveBeenCalledTimes(1);

    // Switching tabs on a computer brings the focus too: still one read.
    focusWindow();
    expect(fetches).toHaveBeenCalledTimes(1);

    expect(await screen.findByText('Reid Supply Co.')).toBeInTheDocument();
    expect(requests[1].headers.get('X-Background')).toBe('1');
  });

  it('reads nothing on focus while signed out', async () => {
    answer(null);
    renderProvider();
    await screen.findByText('Signed out');
    const fetches = vi.spyOn(globalThis, 'fetch');

    focusWindow();

    expect(fetches).not.toHaveBeenCalled();
  });

  it('keeps the page as it was when a read on focus finds no server', async () => {
    const requests = answer(session(ALPHA), 'down', session(REID));
    renderProvider();
    await screen.findByText('Alpha Co');

    focusWindow();
    await waitFor(() => expect(requests).toHaveLength(2));
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
