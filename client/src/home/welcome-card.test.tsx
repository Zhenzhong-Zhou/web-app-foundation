import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Welcome } from '../api/types.gen';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { GETTING_STARTED_DONE, welcome } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { HomePage } from './home-page';

const VIEWER = [
  'users.view',
  'organizations.view',
  'products.view',
  'stock.view',
  'locations.view',
  'orders.view',
];

function serve(card: Welcome | null, start = GETTING_STARTED_DONE) {
  server.use(
    http.get('/api/v1/home', () =>
      HttpResponse.json({ gettingStarted: start, welcome: card, cards: [] }),
    ),
  );
}

function renderHome(
  permissions: string[] = VIEWER,
  user: { name?: string; emailVerified?: boolean } = {},
) {
  return renderWithAuth(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>,
    {
      permissions,
      user: { name: 'Wang Fang', email: 'wang.fang@alpha.example', ...user },
    },
  );
}

const card = () =>
  screen.findByRole('region', { name: 'Welcome to Alpha Co, Wang Fang' });

/**
 * The welcome on Home (ADR-079), in each state it was designed in: the
 * card's words and links come from what the server sends with Home.
 */
describe('the welcome card', () => {
  beforeEach(() => {
    // 12:00 on 20 October, in an organization on UTC.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-10-20T12:00:00.000Z'));
    setOrganizationTimeZone('UTC');
  });
  afterEach(() => {
    vi.useRealTimers();
    setOrganizationTimeZone(null);
  });

  it('greets a Viewer with the note, what they can do and their first week', async () => {
    serve(welcome());
    renderHome();

    const region = await card();
    expect(
      within(region).getByText(
        'You joined today as a Viewer. This card stays on Home for your first two weeks, until November 3.',
      ),
    ).toBeVisible();

    // The note as typed, under the inviter, whose name opens People.
    const note = within(region).getByRole('figure');
    expect(within(note).getByRole('link', { name: 'Mei Lin' })).toHaveAttribute(
      'href',
      '/people/user-mei',
    );
    expect(
      within(note).getByText(/On Monday you’ll shadow Li Na\./),
    ).toBeVisible();

    expect(
      within(region).getByRole('heading', { name: 'What you can do here' }),
    ).toBeVisible();
    expect(
      within(region).getByText('See purchase and sales orders.'),
    ).toBeVisible();
    expect(
      within(region).getByText(
        (_, element) =>
          element?.textContent === 'To do more, ask Mei Lin or David Park.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('link', { name: 'David Park' }),
    ).toHaveAttribute('href', '/people/user-david');

    expect(within(region).getByText('0 of 3 done')).toBeVisible();
    expect(
      within(region).getByRole('link', { name: 'Your account' }),
    ).toHaveAttribute('href', '/account');
    expect(
      within(region).getByRole('link', { name: 'Products' }),
    ).toHaveAttribute('href', '/products');
    expect(
      within(region).getByRole('link', { name: 'Orders' }),
    ).toHaveAttribute('href', '/orders');
    expect(
      within(region).getByText(/at the top, beside the bell/),
    ).toBeVisible();
  });

  it('asks an Admin who joined unconfirmed to confirm first, with Resend, and links what is done', async () => {
    let resent = false;
    server.use(
      http.post('/api/v1/auth/verify-email/resend', () => {
        resent = true;
        return HttpResponse.json({ sent: true }, { status: 202 });
      }),
    );
    serve(
      welcome({
        joinedOn: '2026-10-16',
        lastDay: '2026-10-30',
        inviter: null,
        note: null,
        access: {
          role: { name: 'Admin', description: null },
          holdsEverything: false,
          whomToAsk: [],
        },
        items: [
          { key: 'confirmEmail', done: false, what: null },
          {
            key: 'sayWhoYouAre',
            done: true,
            what: { kind: 'photo', id: null, words: null },
          },
          {
            key: 'lookUp',
            done: true,
            what: { kind: 'lot', id: 'lot-7', words: 'NN-2410-07' },
          },
          { key: 'receiveStock', done: false, what: null },
          { key: 'raiseOrder', done: false, what: null },
        ],
      }),
    );
    const user = userEvent.setup();
    renderHome(
      ['users.create', 'roles.assign', 'stock.move', 'orders.create'],
      {
        emailVerified: false,
      },
    );

    const region = await card();
    expect(
      within(region).getByText(
        'You joined on October 16 as an Admin. This card stays on Home until October 30.',
      ),
    ).toBeVisible();
    expect(within(region).queryByRole('figure')).toBeNull();
    // Someone who may change roles has nobody to ask.
    expect(within(region).queryByText(/To do more/)).toBeNull();

    expect(within(region).getByText('2 of 5 done')).toBeVisible();
    expect(
      within(region).getByText(
        'We sent a link to wang.fang@alpha.example. Inviting colleagues waits until you confirm.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('link', { name: 'Photo added' }),
    ).toHaveAttribute('href', '/account');
    expect(
      within(region).getByRole('link', { name: 'NN-2410-07' }),
    ).toHaveAttribute('href', '/lots/lot-7');
    expect(
      within(region).getByText(
        (_, element) => element?.textContent === 'You opened lot NN-2410-07',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('link', { name: 'Receive stock' }),
    ).toHaveAttribute('href', '/inventory');

    await user.click(
      within(region).getByRole('button', { name: 'Resend the link' }),
    );
    expect(await within(region).findByText('Sent')).toBeVisible();
    expect(resent).toBe(true);
  });

  it('gives the founder one line, and only their own two items while Getting started shows', async () => {
    serve(
      welcome({
        founder: true,
        inviter: null,
        note: null,
        access: {
          role: { name: 'Owner', description: null },
          holdsEverything: true,
          whomToAsk: [],
        },
        items: [
          {
            key: 'confirmEmail',
            done: true,
            what: { kind: 'email', id: null, words: null },
          },
          { key: 'sayWhoYouAre', done: false, what: null },
        ],
      }),
      {
        ...GETTING_STARTED_DONE,
        steps: { ...GETTING_STARTED_DONE.steps, team: false },
        complete: false,
      },
    );
    renderHome(['organizations.update', 'users.create']);

    const region = await card();
    expect(
      within(region).getByText(
        'You started this organization today. This card stays on Home for your first two weeks, until November 3.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByText(
        (_, element) =>
          element?.textContent ===
          'You may do everything here, including settings and closing the organization.',
      ),
    ).toBeVisible();
    expect(
      within(region).queryByRole('heading', { name: 'What you can do here' }),
    ).toBeNull();
    expect(
      within(region).getByText(
        'Setting up the organization is in Getting started, below.',
      ),
    ).toBeVisible();
    expect(within(region).getByText('1 of 2 done')).toBeVisible();
    expect(within(region).getByText('Confirmed')).toBeVisible();
    expect(
      screen.getByRole('region', { name: 'Getting started' }),
    ).toBeVisible();
  });

  it('gives the note from the organization once its inviter has left', async () => {
    serve(
      welcome({ inviter: null, note: 'Ask at the front desk for your key.' }),
    );
    renderHome();

    const note = within(await card()).getByRole('figure');
    expect(within(note).getByText('From Alpha Co')).toBeVisible();
    expect(within(note).queryByRole('link')).toBeNull();
    expect(
      within(note).getByText('Ask at the front desk for your key.'),
    ).toBeVisible();
  });

  it('names a role the organization made as named, with no article', async () => {
    serve(
      welcome({
        access: {
          role: { name: 'Accountant', description: 'Keeps the books' },
          holdsEverything: false,
          whomToAsk: [],
        },
      }),
    );
    renderHome();

    expect(
      within(await card()).getByText(
        'You joined today as Accountant. This card stays on Home for your first two weeks, until November 3.',
      ),
    ).toBeVisible();
  });

  it('says in one line that someone invited as an Owner may do everything', async () => {
    serve(
      welcome({
        access: {
          role: { name: 'Owner', description: null },
          holdsEverything: true,
          whomToAsk: [],
        },
      }),
    );
    renderHome();

    const region = await card();
    expect(
      within(region).getByText(
        'You joined today as an Owner. This card stays on Home for your first two weeks, until November 3.',
      ),
    ).toBeVisible();
    expect(within(region).getByText('everything')).toBeVisible();
    expect(
      within(region).queryByRole('heading', { name: 'What you can do here' }),
    ).toBeNull();
    expect(within(region).queryByText(/To do more/)).toBeNull();
  });

  it('goes at Dismiss, says where what you can do stays, and comes back with Undo', async () => {
    const writes: string[] = [];
    let dismissed = false;
    server.use(
      http.get('/api/v1/home', () =>
        HttpResponse.json({
          gettingStarted: GETTING_STARTED_DONE,
          welcome: dismissed ? null : welcome(),
          cards: [],
        }),
      ),
      http.post('/api/v1/home/welcome/dismiss', () => {
        writes.push('dismiss');
        dismissed = true;
        return new HttpResponse(null, { status: 204 });
      }),
      http.delete('/api/v1/home/welcome/dismiss', () => {
        writes.push('undo');
        dismissed = false;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderHome();

    await user.click(
      within(await card()).getByRole('button', {
        name: 'Dismiss the welcome card',
      }),
    );
    expect(
      screen.queryByRole('region', { name: 'Welcome to Alpha Co, Wang Fang' }),
    ).toBeNull();
    expect(
      await screen.findByText(
        'Welcome card hidden. What you can do here stays on Your account.',
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await card()).toBeVisible();
    expect(writes).toEqual(['dismiss', 'undo']);
  });

  describe('on a phone', () => {
    beforeEach(() => {
      // Every width query matches, as at 390 px; jsdom has no matchMedia.
      vi.stubGlobal('matchMedia', (query: string) => ({
        matches: query.includes('max-width'),
        media: query,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('folds what you can do here into one row after the first week, opened by a tap', async () => {
      serve(welcome());
      const user = userEvent.setup();
      renderHome();

      const region = await card();
      const fold = within(region).getByRole('button', {
        name: /What you can do here/,
      });
      expect(fold).toHaveAttribute('aria-expanded', 'false');
      expect(fold).toHaveTextContent('4 areas, tap to open');
      expect(
        within(region).queryByText('See purchase and sales orders.'),
      ).not.toBeVisible();

      // What to do before what to read.
      const week = within(region).getByRole('heading', {
        name: 'Your first week',
      });
      expect(
        week.compareDocumentPosition(fold) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();

      await user.click(fold);
      expect(fold).toHaveAttribute('aria-expanded', 'true');
      expect(
        within(region).getByText('See purchase and sales orders.'),
      ).toBeVisible();
    });
  });
});
