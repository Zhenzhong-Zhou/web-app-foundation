import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { useRef } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { Welcome } from '../api/types.gen';
import { PageHeader } from '../components/page-header';
import { HelpButton } from '../help/help-button';
import { HelpFrame } from '../help/help-panel';
import { HelpProvider } from '../help/help-provider';
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

function serve(
  card: Welcome | null,
  start = GETTING_STARTED_DONE,
  whatWeDo: string | null = null,
) {
  server.use(
    http.get('/api/v1/home', () =>
      HttpResponse.json({
        whatWeDo,
        gettingStarted: start,
        welcome: card,
        cards: [],
        recent: true,
      }),
    ),
  );
}

/** A window this wide, for the card's width queries; jsdom has none. */
function widthIs(px: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return {
      matches: (!min || px >= Number(min[1])) && (!max || px <= Number(max[1])),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
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

/** Home inside Help's part of the frame: the bar's button, and the panel. */
function HomeWithHelp() {
  const bar = useRef<HTMLElement>(null);
  return (
    <HelpProvider>
      <header ref={bar}>
        <HelpButton />
      </header>
      <HelpFrame bar={bar}>
        <HomePage />
      </HelpFrame>
    </HelpProvider>
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
    // A tablet held sideways, from `md`: the card starts open (ADR-091).
    widthIs(1180);
  });
  afterEach(() => {
    vi.useRealTimers();
    setOrganizationTimeZone(null);
    vi.unstubAllGlobals();
  });

  it('greets a Viewer with the note, what they can do and their first week', async () => {
    serve(
      welcome(),
      GETTING_STARTED_DONE,
      'We import and distribute natural health products.',
    );
    renderHome();

    const region = await card();
    // The organization's own words once, under Home's date, not again in
    // the card (ADR-091's review).
    expect(
      screen.getAllByText('We import and distribute natural health products.'),
    ).toHaveLength(1);
    expect(
      within(region).queryByText(
        'We import and distribute natural health products.',
      ),
    ).toBeNull();
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
    // Each area a link to its page, named as the menu names it (ADR-091's
    // review): Inventory, not Stock and locations.
    expect(
      within(region).getByRole('link', { name: 'Orders' }),
    ).toHaveAttribute('href', '/orders');
    expect(
      within(region).getByRole('link', { name: 'Inventory' }),
    ).toHaveAttribute('href', '/inventory');
    expect(
      within(region).queryByRole('link', { name: 'Stock and locations' }),
    ).toBeNull();

    expect(
      within(region).getByText('Your first week · 0 of 3 done'),
    ).toBeVisible();
    // Each item one link, its whole row: its title, then its hint.
    expect(
      within(region).getByRole('link', {
        name: /^Say who you are\s*A photo or your job title/,
      }),
    ).toHaveAttribute('href', '/account');
    expect(
      within(region).getByRole('link', { name: /^Look up an item or a lot/ }),
    ).toHaveAttribute('href', '/items');
    expect(
      within(region).getByRole('link', { name: /^Open an order/ }),
    ).toHaveAttribute('href', '/orders');
    expect(
      within(region).getByText(/at the top, beside the bell/),
    ).toBeVisible();
  });

  // Look up opens a top-level page, which offers Back to Home (#341).
  it('opens Look up with Back to Home', async () => {
    serve(welcome());
    renderWithAuth(
      <MemoryRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route
            path="*"
            element={<PageHeader crumbs={[]} title="A top-level page" />}
          />
        </Routes>
      </MemoryRouter>,
      {
        permissions: VIEWER,
        user: { name: 'Wang Fang', email: 'wang.fang@alpha.example' },
      },
    );

    const lookUp = { name: /^Look up an item or a lot/ };
    await userEvent.click(within(await card()).getByRole('link', lookUp));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(within(await card()).getByRole('link', lookUp)).toBeVisible();
  });

  it('opens Help on Home’s guide from the Help in its foot, as the bar’s does', async () => {
    serve(welcome());
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter>
        <HomeWithHelp />
      </MemoryRouter>,
      {
        permissions: VIEWER,
        user: { name: 'Wang Fang', email: 'wang.fang@alpha.example' },
      },
    );

    const region = await card();
    // The word and its icon, one button named Help, in the sentence that
    // still says where the bar's Help is.
    const inCard = within(region).getByRole('button', { name: 'Help' });
    expect(inCard.querySelector('svg')).not.toBeNull();
    expect(inCard.closest('p')).toHaveTextContent(
      'Every page has Help at the top, beside the bell. It explains the page you’re on.',
    );

    await user.click(inCard);
    const help = screen.getByRole('complementary', { name: 'Help' });
    // Focus moves in an effect once the guide is drawn (#210).
    const title = await within(help).findByRole('heading', {
      level: 2,
      name: 'Home',
    });
    await waitFor(() => expect(title).toHaveFocus());
    expect(
      within(screen.getByRole('banner')).getByRole('button', { name: 'Help' }),
    ).toHaveAttribute('aria-expanded', 'true');

    // Pressed again while open, it keeps Home's guide open.
    await user.click(inCard);
    expect(
      screen.getByRole('complementary', { name: 'Help' }),
    ).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(inCard).toHaveFocus());
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
          roles: [{ name: 'Admin', description: null }],
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

    expect(
      within(region).getByText('Your first week · 2 of 5 done'),
    ).toBeVisible();
    // A ticked step reads as done, after a space, to a screen reader.
    expect(
      within(region).getByText(
        (_, element) =>
          element?.tagName === 'SPAN' &&
          element.textContent === 'Say who you are (done)',
      ),
    ).toBeInTheDocument();
    expect(
      within(region).getByText(
        'We sent a link to wang.fang@alpha.example. Inviting colleagues waits until you confirm.',
      ),
    ).toBeVisible();
    // A done item's row opens what was done.
    expect(
      within(region).getByRole('link', {
        name: /^Say who you are \(done\)\s*Photo added$/,
      }),
    ).toHaveAttribute('href', '/account');
    expect(
      within(region).getByRole('link', { name: /You opened lot NN-2410-07$/ }),
    ).toHaveAttribute('href', '/lots/lot-7');
    expect(
      within(region).getByText(
        (_, element) => element?.textContent === 'You opened lot NN-2410-07',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('link', { name: /^Receive stock/ }),
    ).toHaveAttribute('href', '/inventory');

    await user.click(
      within(region).getByRole('button', { name: 'Resend the link' }),
    );
    // In place of the button, announced, and where focus was.
    const sent = await within(region).findByText('Sent');
    expect(sent).toBeVisible();
    // Given in an effect once Sent is drawn (#210).
    await waitFor(() => expect(sent).toHaveFocus());
    expect(sent.closest('[role="status"]')).not.toBeNull();
    expect(resent).toBe(true);
  });

  it('says why the link could not be sent again, and keeps Resend', async () => {
    server.use(
      http.post('/api/v1/auth/verify-email/resend', () =>
        HttpResponse.json(
          { message: 'ThrottlerException: Too Many Requests' },
          { status: 429 },
        ),
      ),
    );
    serve(
      welcome({
        items: [
          { key: 'confirmEmail', done: false, what: null },
          { key: 'sayWhoYouAre', done: false, what: null },
        ],
      }),
    );
    const user = userEvent.setup();
    renderHome(VIEWER, { emailVerified: false });

    const region = await card();
    await user.click(
      within(region).getByRole('button', { name: 'Resend the link' }),
    );
    expect(
      await within(region).findByText(
        'Too many requests just now. Try again in a minute.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('button', { name: 'Resend the link' }),
    ).toBeEnabled();
  });

  /**
   * The first week's Receive shows for whoever may receive against an
   * order (ADR-080). The dock that may not move stock otherwise receives
   * on the order, so its button opens the confirmed purchases.
   */
  it('sends someone who receives only against orders to the confirmed purchases', async () => {
    serve(
      welcome({
        items: [{ key: 'receiveStock', done: false, what: null }],
      }),
    );
    renderHome(['orders.view', 'orders.receive', 'locations.view']);

    const region = await card();
    expect(
      within(region).getByText(
        'Record goods as they arrive, against the purchase order they came on.',
      ),
    ).toBeVisible();
    expect(
      within(region).getByRole('link', { name: /^Receive stock/ }),
    ).toHaveAttribute('href', '/orders?direction=purchase&status=confirmed');
  });

  it('gives the founder one line, and only their own two items while Getting started shows', async () => {
    serve(
      welcome({
        founder: true,
        inviter: null,
        note: null,
        access: {
          roles: [{ name: 'Owner', description: null }],
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
    expect(
      within(region).getByText('Your first week · 1 of 2 done'),
    ).toBeVisible();
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

  it('starts open from `md`, and Fold folds it to its one line', async () => {
    serve(welcome());
    const user = userEvent.setup();
    renderHome();

    const region = await card();
    const fold = within(region).getByRole('button', { name: 'Fold' });
    expect(fold).toHaveAttribute('aria-expanded', 'true');
    expect(within(region).getByRole('figure')).toBeVisible();

    await user.click(fold);
    expect(fold).toHaveAttribute('aria-expanded', 'false');
    expect(fold).toHaveTextContent('Open');
    expect(within(region).queryByRole('figure')).toBeNull();
    expect(
      within(region).getByText('Your first week · 0 of 3 done'),
    ).toBeVisible();
  });

  it('says Done, opening nothing, for an item whose record has since gone', async () => {
    serve(
      welcome({
        items: [
          { key: 'sayWhoYouAre', done: false, what: null },
          {
            key: 'lookUp',
            done: true,
            what: { kind: 'lot', id: null, words: null },
          },
          { key: 'openOrder', done: false, what: null },
        ],
      }),
    );
    renderHome();

    const region = await card();
    const item = within(region)
      .getByText('Look up an item or a lot', { exact: false })
      .closest('li');
    if (!item) throw new Error('No item for the lookup');
    expect(within(item).getByText('Done')).toBeVisible();
    expect(within(item).queryByRole('link')).toBeNull();
    expect(
      within(region).getByText('Your first week · 1 of 3 done'),
    ).toBeVisible();
  });

  it('names a role the organization made as named, with no article', async () => {
    serve(
      welcome({
        access: {
          roles: [{ name: 'Accountant', description: 'Keeps the books' }],
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
          roles: [{ name: 'Owner', description: null }],
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
          recent: true,
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
    // Dismiss went with the card: focus is on the page's heading.
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
    expect(
      await screen.findByText(
        'Welcome card hidden. What you can do here stays on Your account.',
      ),
    ).toBeVisible();

    // The next Tab from the heading is Undo, which holds its message while
    // it has focus.
    await user.tab();
    expect(screen.getByRole('button', { name: 'Undo' })).toHaveFocus();
    await user.click(screen.getByRole('button', { name: 'Undo' }));
    expect(await card()).toBeVisible();
    expect(writes).toEqual(['dismiss', 'undo']);
    // Undo went with its message: focus is on the card it brought back.
    await waitFor(() =>
      expect(
        screen.getByRole('heading', {
          name: 'Welcome to Alpha Co, Wang Fang',
        }),
      ).toHaveFocus(),
    );
  });

  describe('on a phone', () => {
    beforeEach(() => widthIs(390));

    it('starts folded to one line above the tiles, and opens in place, what to do before what to read', async () => {
      serve(welcome());
      const user = userEvent.setup();
      renderHome();

      const region = await card();
      const open = within(region).getByRole('button', { name: 'Open' });
      expect(open).toHaveAttribute('aria-expanded', 'false');
      expect(
        within(region).getByText('Your first week · 0 of 3 done'),
      ).toBeVisible();
      expect(within(region).queryByRole('figure')).toBeNull();
      expect(
        within(region).queryByRole('button', {
          name: 'Dismiss the welcome card',
        }),
      ).toBeNull();

      await user.click(open);
      expect(open).toHaveAttribute('aria-expanded', 'true');
      expect(open).toHaveTextContent('Fold');
      expect(within(region).getByRole('figure')).toBeVisible();
      expect(
        within(region).getByText('See purchase and sales orders.'),
      ).toBeVisible();
      const week = within(region).getByRole('list', {
        name: 'Your first week',
      });
      const youCan = within(region).getByRole('heading', {
        name: 'What you can do here',
      });
      expect(
        week.compareDocumentPosition(youCan) & Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
    });
  });
});
