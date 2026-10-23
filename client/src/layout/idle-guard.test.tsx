import { fireEvent, render } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { CurrentSession } from '../api/types.gen';
import { AuthContext } from '../auth/auth-context';
import { api } from '../lib/api';
import { server } from '../test/setup';
import { outdatedRefusal } from '../test/version';
import { IdleGuard } from './idle-guard';

/** A session not kept: signed out after ten idle minutes (ADR-065). */
const SESSION = {
  user: {
    id: 'user-1',
    email: 'owner@alpha.example.com',
    name: 'Owner',
    emailVerified: true,
    locale: null,
  },
  organization: null,
  permissions: [],
  idleLimitMs: 10 * 60_000,
} as unknown as CurrentSession;

/** Each read of the session, as the guard's pings are. */
function countReads() {
  const reads = { count: 0 };
  server.use(
    http.get('/api/v1/auth/me', () => {
      reads.count += 1;
      return HttpResponse.json(SESSION);
    }),
  );
  return reads;
}

function renderGuard() {
  render(
    <AuthContext.Provider
      value={{
        session: SESSION,
        loading: false,
        error: null,
        refresh: () => Promise.resolve(),
        signedOut: () => undefined,
      }}
    >
      <IdleGuard />
    </AuthContext.Provider>,
  );
}

/** Someone pressing a key, a minute and more after the last ping. */
function activeLater(start: number) {
  vi.spyOn(Date, 'now').mockReturnValue(start + 61_000);
  fireEvent.keyDown(window, { key: 'a' });
}

describe('IdleGuard, telling the server', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads the session once a minute at most while someone is active', async () => {
    const reads = countReads();
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start);
    renderGuard();

    activeLater(start);
    await vi.waitFor(() => expect(reads.count).toBe(1));
  });

  it('asks nothing while the API refuses this tab as outdated (ADR-081)', async () => {
    server.use(http.get('/api/v1/things', () => outdatedRefusal()));
    await api('/things').catch(() => undefined);
    const reads = countReads();
    const start = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(start);
    renderGuard();

    activeLater(start);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(reads.count).toBe(0);
  });
});
