import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useState } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
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
});
