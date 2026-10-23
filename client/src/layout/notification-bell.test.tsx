import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { OUTDATED, outdatedRefusal, serveVersion } from '../test/version';
import { newVersionNow, noteServed } from '../version/version-check';
import { NotificationBell } from './notification-bell';

/** The frame around the bell, rendering again as the top bar's does. */
function Frame() {
  const [renders, setRenders] = useState(0);
  return (
    <MemoryRouter>
      <button type="button" onClick={() => setRenders(renders + 1)}>
        Render again
      </button>
      <NotificationBell />
    </MemoryRouter>
  );
}

/** The bell (ADR-036), in the top bar on every page. */
describe('NotificationBell', () => {
  it('holds no number its name does not say, however often it renders', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/notifications/unread-count', () => {
        reads += 1;
        return HttpResponse.json({ count: 0 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(<Frame />);
    await vi.waitFor(() => expect(reads).toBe(1));

    await user.click(screen.getByRole('button', { name: 'Render again' }));
    await user.click(screen.getByRole('button', { name: 'Render again' }));

    expect(
      screen.getByRole('button', { name: 'Notifications' }),
    ).toHaveTextContent(/^$/);
  });

  it('opens the page on People of someone the reader invited, once they join (ADR-079)', async () => {
    server.use(
      http.get('/api/v1/notifications/unread-count', () =>
        HttpResponse.json({ count: 1 }),
      ),
      http.get('/api/v1/notifications', () =>
        HttpResponse.json({
          entries: [
            {
              id: 'n-1',
              type: 'invitation.accepted',
              title: 'Wang Fang joined',
              body: 'Wang Fang accepted your invitation and joined Alpha Co as a Viewer.',
              resourceType: 'user',
              resourceId: 'user-wang',
              readAt: null,
              createdAt: new Date().toISOString(),
            },
          ],
          nextCursor: null,
        }),
      ),
      http.post(
        '/api/v1/notifications/n-1/read',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
        <Routes>
          <Route path="/" element={null} />
          <Route path="/people/:userId" element={<h1>Their page</h1>} />
        </Routes>
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    await user.click(
      await screen.findByRole('menuitem', { name: /Wang Fang joined/ }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Their page' }),
    ).toBeVisible();
  });

  it('says a list that failed to load did, with Try again, never Nothing yet (#189)', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/notifications', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json({ entries: [], nextCursor: null });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    await user.click(screen.getByRole('button', { name: 'Notifications' }));
    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Could not load notifications.');
    expect(screen.queryByText('Nothing yet.')).toBeNull();

    await user.click(within(failed).getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('Nothing yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  describe('in a tab the API refuses as outdated (ADR-081)', () => {
    it('says so when the menu opens, with Reload once the new version is out, never Nothing yet (#189)', async () => {
      serveVersion({ urgent: true });
      server.use(http.get('/api/v1/notifications', () => outdatedRefusal()));
      const user = userEvent.setup();
      renderWithAuth(
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>,
      );

      await user.click(screen.getByRole('button', { name: 'Notifications' }));
      const refusal = await screen.findByRole('alert');
      expect(refusal).toHaveTextContent(OUTDATED);
      expect(
        within(refusal).getByRole('button', { name: 'Reload' }),
      ).toBeVisible();
      expect(
        within(refusal).queryByRole('button', { name: 'Try again' }),
      ).toBeNull();
      expect(screen.queryByText('Nothing yet.')).toBeNull();
    });

    it('stops asking, since every ask would be refused, and asks again once served, as after a reload', async () => {
      vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] });
      let asks = 0;
      server.use(
        http.get('/api/v1/notifications/unread-count', () => {
          asks += 1;
          // The API deploys between the first ask and the second.
          return asks === 2
            ? outdatedRefusal()
            : HttpResponse.json({ count: 0 });
        }),
      );
      renderWithAuth(
        <MemoryRouter>
          <NotificationBell />
        </MemoryRouter>,
      );
      await vi.waitFor(() => expect(asks).toBe(1));

      act(() => vi.advanceTimersByTime(60_000));
      await vi.waitFor(() => expect(newVersionNow().outdated).toBe(true));
      act(() => vi.advanceTimersByTime(10 * 60_000));
      expect(asks).toBe(2);

      // Served again, as a tab loaded from the new version is: it asks at
      // once, and each minute after.
      act(() => noteServed());
      await vi.waitFor(() => expect(asks).toBe(3));
      act(() => vi.advanceTimersByTime(60_000));
      await vi.waitFor(() => expect(asks).toBe(4));
    });
  });
});
