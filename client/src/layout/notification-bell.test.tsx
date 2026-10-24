import { act, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type { Notification } from '../api/types.gen';
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

/**
 * One unread entry, someone the reader invited having joined; the list once
 * `until` settles, when given.
 */
function serveOneEntry(
  entry: Partial<Notification> = {},
  until?: Promise<void>,
) {
  server.use(
    http.get('/api/v1/notifications/unread-count', () =>
      HttpResponse.json({ count: 1 }),
    ),
    http.get('/api/v1/notifications', async () => {
      await until;
      return HttpResponse.json({
        entries: [
          {
            id: 'n-1',
            type: 'invitation.accepted',
            title: 'Wang Fang joined',
            body: null,
            resourceType: 'user',
            resourceId: 'user-wang',
            readAt: null,
            createdAt: new Date().toISOString(),
            ...entry,
          },
        ],
        nextCursor: null,
      });
    }),
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
    serveOneEntry({
      body: 'Wang Fang accepted your invitation and joined Alpha Co as a Viewer.',
    });
    server.use(
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

  // Above the list rather than in it: in a menu, Tab closed it and the
  // arrows passed Mark all read by (#196).
  it('reaches Mark all read from the keyboard, its menu holding only the entries', async () => {
    serveOneEntry();
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    const entry = await screen.findByRole('menuitem', {
      name: /Wang Fang joined/,
    });
    await vi.waitFor(() => expect(entry).toHaveFocus());

    await user.tab({ shift: true });
    expect(screen.getByRole('button', { name: 'Mark all read' })).toHaveFocus();
    expect(
      within(screen.getByRole('menu', { name: 'Notifications' })).queryByRole(
        'button',
      ),
    ).toBeNull();
  });

  // More than a menu, so a dialog named by its title, which the bell says
  // it opens, and whether it is open (#196).
  it('opens a dialog named Notifications, the bell saying whether it is open', async () => {
    serveOneEntry();
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    const bell = await screen.findByRole('button', {
      name: 'Notifications, 1 unread',
    });
    expect(bell).toHaveAttribute('aria-haspopup', 'dialog');
    expect(bell).toHaveAttribute('aria-expanded', 'false');

    await user.click(bell);
    const dialog = await screen.findByRole('dialog', { name: 'Notifications' });
    expect(within(dialog).getByRole('menu')).toBeVisible();
    expect(
      within(dialog).getByRole('button', { name: 'Mark all read' }),
    ).toBeVisible();
    expect(bell).toHaveAttribute('aria-expanded', 'true');

    const entry = await within(dialog).findByRole('menuitem', {
      name: /Wang Fang joined/,
    });
    await vi.waitFor(() => expect(entry).toHaveFocus());
    await user.keyboard('{Escape}');
    await vi.waitFor(() =>
      expect(bell).toHaveAttribute('aria-expanded', 'false'),
    );
  });

  // The button goes once nothing is unread, and the focus would go with it
  // to the popover itself (#196).
  it('gives the focus to the first entry after Mark all read', async () => {
    serveOneEntry();
    server.use(
      http.post(
        '/api/v1/notifications/read-all',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    const entry = await screen.findByRole('menuitem', {
      name: /Wang Fang joined/,
    });
    await vi.waitFor(() => expect(entry).toHaveFocus());
    await user.tab({ shift: true });
    await user.keyboard('{Enter}');

    expect(screen.queryByRole('button', { name: 'Mark all read' })).toBeNull();
    expect(entry).toHaveFocus();
  });

  // A slow list, as from an API waking: someone already on their way to
  // Mark all read is not pulled back into the list when it arrives (#196).
  it('leaves the focus where a key took it while the list loaded', async () => {
    let arrive = () => {};
    serveOneEntry(
      {},
      new Promise((resolve) => {
        arrive = resolve;
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <NotificationBell />
      </MemoryRouter>,
    );

    await user.click(
      await screen.findByRole('button', { name: 'Notifications, 1 unread' }),
    );
    expect(await screen.findByText('Loading…')).toBeVisible();
    await user.tab({ shift: true });
    const markAllRead = screen.getByRole('button', { name: 'Mark all read' });
    expect(markAllRead).toHaveFocus();

    arrive();
    expect(
      await screen.findByRole('menuitem', { name: /Wang Fang joined/ }),
    ).toBeVisible();
    expect(markAllRead).toHaveFocus();
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
