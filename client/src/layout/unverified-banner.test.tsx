import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { Link, MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { HomeResponse, Welcome } from '../api/types.gen';
import { HomePage } from '../home/home-page';
import { organizationToday } from '../lib/time-zone';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { AppLayout } from './app-layout';

const BANNER = 'Confirm your email address to secure your account.';

const START: HomeResponse['gettingStarted'] = {
  steps: {
    organization: true,
    location: true,
    product: true,
    partner: true,
    receipt: true,
    invoice: true,
    team: true,
  },
  teamSkipped: false,
  dismissed: false,
  complete: true,
};

const welcome = (items: Welcome['items']): Welcome => ({
  joinedOn: organizationToday(),
  lastDay: organizationToday(),
  founder: false,
  inviter: null,
  note: null,
  access: {
    role: { id: 'role-admin', name: 'Admin', description: null },
    holdsEverything: false,
    whomToAsk: [],
  },
  items,
});

function serve(card: Welcome | null) {
  server.use(
    http.get('/api/v1/home', () =>
      HttpResponse.json({ gettingStarted: START, welcome: card, cards: [] }),
    ),
    http.get('/api/v1/notifications/unread-count', () =>
      HttpResponse.json({ count: 0 }),
    ),
  );
}

/** Home and one other page, inside the frame that holds the banner. */
function renderFrame() {
  return renderWithAuth(
    <MemoryRouter>
      <Routes>
        <Route element={<AppLayout />}>
          <Route
            path="/"
            element={
              <>
                <HomePage />
                <Link to="/elsewhere">Elsewhere</Link>
              </>
            }
          />
          <Route path="/elsewhere" element={<h1>Elsewhere</h1>} />
        </Route>
      </Routes>
    </MemoryRouter>,
    { user: { emailVerified: false } },
  );
}

/**
 * The banner asking to confirm the address (ADR-017) is not said twice:
 * not on Home while the welcome lists the same, and on every other page
 * still (ADR-079).
 */
describe('the confirm-your-email banner', () => {
  it('steps aside on Home while the welcome asks, and is back on the next page', async () => {
    serve(
      welcome([
        { key: 'confirmEmail', done: false, what: null },
        { key: 'sayWhoYouAre', done: false, what: null },
      ]),
    );
    const user = userEvent.setup();
    renderFrame();

    expect(
      await screen.findByRole('region', { name: /^Welcome to Alpha Co/ }),
    ).toBeVisible();
    expect(screen.queryByText(BANNER)).toBeNull();

    await user.click(screen.getByRole('link', { name: 'Elsewhere' }));
    expect(
      await screen.findByRole('heading', { name: 'Elsewhere' }),
    ).toBeVisible();
    expect(screen.getByText(BANNER)).toBeVisible();
  });

  it('stays on Home when the welcome does not ask', async () => {
    serve(null);
    renderFrame();

    expect(await screen.findByText(BANNER)).toBeVisible();
  });
});
