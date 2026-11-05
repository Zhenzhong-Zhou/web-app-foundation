import { ThemeProvider } from '@mui/material/styles';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HomeResponse } from '../api/types.gen';
import { PageHeader } from '../components/page-header';
import type { HomeKind } from '../lib/api-names';
import {
  browserTimeZone,
  organizationTimeZone,
  setOrganizationTimeZone,
} from '../lib/time-zone';
import { zoneLabel } from '../lib/time-zone-label';
import { drawnIn } from '../test/drawn-colour';
import { GETTING_STARTED_DONE, welcome } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { themeFor } from '../theme';
import { contrast } from '../theme/accent';
import { HomePage } from './home-page';

const COMPLETE: HomeResponse['gettingStarted'] = {
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

/** Home links everywhere, so it renders inside a router. */
const routed = (element: ReactElement) => (
  <MemoryRouter>{element}</MemoryRouter>
);

/**
 * Home for a member past their first two weeks: no welcome (ADR-079), and
 * no What we do written yet (ADR-091).
 */
function serve(home: Omit<HomeResponse, 'welcome' | 'whatWeDo'>) {
  const response: HomeResponse = { ...home, welcome: null, whatWeDo: null };
  server.use(http.get('/api/v1/home', () => HttpResponse.json(response)));
}

describe('HomePage', () => {
  it('greets, with the date and the time, What we do, and a tile per kind, each one link', async () => {
    server.use(
      http.get('/api/v1/home', () =>
        HttpResponse.json({
          whatWeDo: 'We import and distribute natural health products.',
          gettingStarted: COMPLETE,
          welcome: null,
          cards: [
            { kind: 'toShip', count: 12, late: 2 },
            { kind: 'costsWaiting', count: 2, late: 0 },
          ],
        } satisfies HomeResponse),
      ),
    );
    renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view', 'costs.view'],
    });

    expect(
      await screen.findByText(
        'We import and distribute natural health products.',
      ),
    ).toBeVisible();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Owner$/,
    );
    // The organization's day and time to the minute, never its name again.
    const now = new Date();
    const zone = organizationTimeZone();
    const day = new Intl.DateTimeFormat('en', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      timeZone: zone,
    }).format(now);
    expect(screen.getByText(new RegExp(`^${day}, \\d`))).toBeVisible();
    expect(screen.queryByText(/Alpha Co/)).toBeNull();

    // The whole tile is one link, its count and status in its name.
    const today = screen.getByRole('region', { name: 'What needs you today' });
    const ship = within(today).getByRole('link', {
      name: 'To ship, 12, 2 late',
    });
    expect(ship).toHaveAttribute(
      'href',
      '/orders?direction=sale&outstanding=1',
    );
    expect(within(ship).getByText('2 late')).toBeVisible();
    expect(
      within(today).getByRole('link', { name: 'Waiting for a cost, 2' }),
    ).toHaveAttribute('href', '/costs');
    expect(within(today).getAllByRole('link')).toHaveLength(2);
  });

  // The ninth tile (ADR-085): red with its out count, opening Reorder
  // points on Low, and its late button on Out.
  it('shows Low stock with its out count, opening Reorder points on Low, and Out from what is late', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'lowStock', count: 3, late: 1 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    expect(
      await screen.findByRole('link', { name: 'Low stock, 3, 1 out' }),
    ).toHaveAttribute('href', '/inventory?tab=reorder-points&status=low');
    expect(
      screen.getByRole('link', { name: '1 item out of stock' }),
    ).toHaveAttribute('href', '/inventory?tab=reorder-points&status=out');
  });

  /**
   * What is late (ADR-091): its heading how many, one button per kind
   * opening just the late ones, the expired for lots and licences; a kind
   * with nothing late has none.
   */
  it('names what is late, a button per kind opening just the late ones', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        { kind: 'toShip', count: 12, late: 2 },
        { kind: 'toReceive', count: 5, late: 0 },
        { kind: 'expiring', count: 4, late: 1 },
        { kind: 'licences', count: 1, late: 1 },
      ],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view', 'stock.view', 'product_licences.view'],
    });

    const late = await screen.findByRole('region', {
      name: '4 things are late',
    });
    const buttons = within(late).getAllByRole('link');
    expect(
      buttons.map((button) => [
        button.textContent,
        button.getAttribute('href'),
      ]),
    ).toEqual([
      ['2 orders to ship', '/orders?direction=sale&outstanding=1&late=1'],
      ['1 expired lot', '/inventory?expiring=1&expired=1'],
      ['1 expired licence', '/licences?expiring=1&expired=1'],
    ]);
    // The number in bold, the words after.
    expect(within(buttons[0]).getByText('2').tagName).toBe('STRONG');
    // The tile opens all of its kind, the late first; the button just those.
    expect(
      screen.getByRole('link', { name: 'Expiring soon, 4, 1 expired' }),
    ).toHaveAttribute('href', '/inventory?expiring=1');
  });

  it('says nothing is late in one calm line, and nothing needs you when all is done', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'toShip', count: 3, late: 0 }],
    });
    const { unmount } = renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view'],
    });
    expect(await screen.findByText('Nothing is late today.')).toBeVisible();
    expect(screen.queryByRole('region', { name: /late/ })).toBeNull();
    unmount();

    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'toShip', count: 0, late: 0 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });
    expect(await screen.findByText('Nothing needs you today.')).toBeVisible();
  });

  // A tile with nothing to do stays in its place, quiet, still a link
  // (ADR-091): its words in place of the count.
  it('keeps a tile with nothing to do, quiet and still a link', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'lowStock', count: 0, late: 0 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    const low = await screen.findByRole('link', {
      name: 'Low stock, Nothing low',
    });
    expect(low).toHaveAttribute(
      'href',
      '/inventory?tab=reorder-points&status=low',
    );
    expect(within(low).getByText('Nothing low')).toBeVisible();
    expect(within(low).queryByText('0')).toBeNull();
  });

  // A server deployed after the tab opened may send a kind this build has
  // never heard of (ADR-081): Home shows the rest, and what is late leaves
  // the newcomer out, rather than crash.
  it('skips a card kind it does not know', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        { kind: 'toShip', count: 1, late: 0 },
        {
          kind: 'fromANewerServer' as string as HomeKind,
          count: 4,
          late: 2,
        },
      ],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });

    expect(await screen.findByText('Nothing is late today.')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'To ship, 1' })).toBeTruthy();
    expect(
      within(
        screen.getByRole('region', { name: 'What needs you today' }),
      ).getAllByRole('link'),
    ).toHaveLength(1);
  });

  // The critical tone's text on its tint, which holds AA in both modes
  // (tokens.ts): asked by a path in sx, never Typography's color prop.
  it('draws what is late in the critical tone, at 4.5 : 1 in both modes', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'toShip', count: 2, late: 1 }],
    });
    renderWithAuth(
      routed(
        <ThemeProvider theme={themeFor('en')}>
          <HomePage />
        </ThemeProvider>,
      ),
      { permissions: ['orders.view'] },
    );

    const late = await screen.findByRole('region', {
      name: '1 thing is late',
    });
    const { color, backgroundColor } = getComputedStyle(late);
    expect(color).toBe('var(--mui-palette-tone-critical-fg)');
    for (const mode of ['light', 'dark'] as const) {
      expect(
        contrast(drawnIn(mode, color), drawnIn(mode, backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  it('offers only the quick actions the role may take, the first the main one', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['stock.view', 'orders.create'],
    });

    const raise = await screen.findByRole('link', { name: 'Raise an order' });
    expect(raise).toHaveClass('MuiButton-contained');
    const trace = screen.getByRole('link', { name: 'Trace a lot' });
    expect(trace).not.toHaveClass('MuiButton-contained');
    expect(screen.queryByRole('link', { name: 'Plan a run' })).toBeNull();
  });

  /**
   * A role that may use none of Home's actions (ADR-091): one quiet line
   * in their place, and whom to ask, from Your access past the welcome.
   */
  it('says whom to ask where the role may use none of the actions', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    server.use(
      http.get('/api/v1/account/membership', () =>
        HttpResponse.json(welcome().access),
      ),
    );
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });

    expect(
      await screen.findByText(
        'Your role does not include raising orders, receiving stock or planning runs. To do more, ask Mei Lin or David Park.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Raise an order' })).toBeNull();
  });

  /**
   * A link from Home to a top-level page offers Back to Home (#341): each
   * quick action, a tile, a late button, and a step of Getting started.
   */
  describe('Back to Home', () => {
    /** Home, and a top-level page for each link to land on. */
    function atHome(permissions: string[]) {
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
        { permissions },
      );
    }

    it('from each quick action', async () => {
      serve({ gettingStarted: COMPLETE, cards: [] });
      atHome(['stock.view', 'stock.move', 'production.create']);

      for (const name of ['Receive stock', 'Trace a lot', 'Plan a run']) {
        await userEvent.click(await screen.findByRole('link', { name }));
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      }

      expect(
        await screen.findByRole('link', { name: 'Plan a run' }),
      ).toBeVisible();
    });

    it('from a tile and from a late button', async () => {
      serve({
        gettingStarted: COMPLETE,
        cards: [{ kind: 'toShip', count: 3, late: 1 }],
      });
      atHome(['orders.view']);

      for (const name of ['To ship, 3, 1 late', '1 order to ship']) {
        await userEvent.click(await screen.findByRole('link', { name }));
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      }

      expect(
        await screen.findByRole('link', { name: 'To ship, 3, 1 late' }),
      ).toBeVisible();
    });

    it('from a step of Getting started', async () => {
      serve({
        gettingStarted: {
          ...COMPLETE,
          steps: { ...COMPLETE.steps, organization: false },
          complete: false,
        },
        cards: [],
      });
      atHome(['organizations.update']);

      await userEvent.click(
        await screen.findByRole('link', { name: 'Open settings' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(
        await screen.findByRole('link', { name: 'Open settings' }),
      ).toBeVisible();
    });
  });

  // A quick read shows no skeleton (conventions, Loading states; #358).
  it('draws no skeleton until the read takes a while', async () => {
    server.use(
      http.get('/api/v1/home', async () => {
        await delay(400);
        return HttpResponse.json({
          whatWeDo: null,
          gettingStarted: COMPLETE,
          welcome: null,
          cards: [],
        } satisfies HomeResponse);
      }),
    );
    renderWithAuth(routed(<HomePage />));

    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    // Then placeholders the tiles' size, where the tiles will be.
    await waitFor(() =>
      expect(document.querySelectorAll('.MuiSkeleton-root')).toHaveLength(6),
    );
  });

  it('says a dropped connection in words, not the browser’s', async () => {
    server.use(http.get('/api/v1/home', () => HttpResponse.error()));
    renderWithAuth(routed(<HomePage />));

    expect(
      await screen.findByText('Could not reach the server.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Failed to fetch/)).toBeNull();
  });

  it('leads a new organization with Getting started, Skip only on the team step', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        steps: {
          ...COMPLETE.steps,
          product: false,
          partner: false,
          receipt: false,
          invoice: false,
          team: false,
        },
        complete: false,
      },
      cards: [{ kind: 'toShip', count: 0, late: 0 }],
    });
    let skipped = false;
    server.use(
      http.post('/api/v1/home/getting-started/skip-team', () => {
        skipped = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.view'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).getByText('2 of 7 done')).toBeTruthy();
    expect(within(start).getAllByRole('button', { name: 'Skip' })).toHaveLength(
      1,
    );
    expect(within(start).getByRole('button', { name: 'Dismiss' })).toBeTruthy();
    // Nothing to do yet: the tiles stay in their places, quiet (ADR-091).
    expect(
      screen.getByRole('link', { name: 'To ship, No orders to ship' }),
    ).toBeVisible();
    expect(screen.getByText('Nothing needs you today.')).toBeVisible();

    await user.click(within(start).getByRole('button', { name: 'Skip' }));
    await vi.waitFor(() => expect(skipped).toBe(true));
  });

  it('leaves Getting started’s first step the one primary action while it shows', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        complete: false,
        steps: { ...COMPLETE.steps, organization: false },
      },
      cards: [],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.create'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(
      within(start).getByRole('link', { name: 'Open settings' }),
    ).toHaveClass('MuiButton-contained');
    const quick = screen
      .getAllByRole('link', { name: 'Raise an order' })
      .filter((link) => !start.contains(link));
    expect(quick).toHaveLength(1);
    expect(quick[0]).not.toHaveClass('MuiButton-contained');
  });

  it('puts Getting started straight after the welcome, the quick actions after both, while it shows', async () => {
    const respond = (start: HomeResponse['gettingStarted']) =>
      server.use(
        http.get('/api/v1/home', () =>
          HttpResponse.json({
            gettingStarted: start,
            welcome: welcome({ founder: true, inviter: null, note: null }),
            cards: [],
          }),
        ),
      );
    const follows = (first: Element, then: Element) =>
      !!(
        first.compareDocumentPosition(then) & Node.DOCUMENT_POSITION_FOLLOWING
      );

    respond({
      ...COMPLETE,
      complete: false,
      steps: { ...COMPLETE.steps, location: false },
    });
    const { unmount } = renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.create'],
    });
    const card = await screen.findByRole('region', { name: /^Welcome to/ });
    const start = screen.getByRole('region', { name: 'Getting started' });
    const raise = screen
      .getAllByRole('link', { name: 'Raise an order' })
      .find((link) => !start.contains(link))!;
    expect(follows(card, start)).toBe(true);
    expect(follows(start, raise)).toBe(true);
    unmount();

    // Without Getting started, Home is as it was: the welcome, then the
    // quick actions.
    respond(GETTING_STARTED_DONE);
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.create'],
    });
    const alone = await screen.findByRole('region', { name: /^Welcome to/ });
    expect(
      screen.queryByRole('region', { name: 'Getting started' }),
    ).toBeNull();
    expect(
      follows(alone, screen.getByRole('link', { name: 'Raise an order' })),
    ).toBe(true);
  });

  it('puts focus on the page’s heading once Getting started is dismissed', async () => {
    let dismissed = false;
    server.use(
      http.get('/api/v1/home', () =>
        HttpResponse.json({
          gettingStarted: { ...COMPLETE, complete: false, dismissed },
          welcome: null,
          cards: [],
        }),
      ),
      http.post('/api/v1/home/getting-started/dismiss', () => {
        dismissed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    await user.click(within(start).getByRole('button', { name: 'Dismiss' }));

    await vi.waitFor(() =>
      expect(
        screen.queryByRole('region', { name: 'Getting started' }),
      ).toBeNull(),
    );
    expect(screen.getByRole('heading', { level: 1 })).toHaveFocus();
  });

  it('offers Invite someone on the team step to those who may invite, opening the dialog', async () => {
    const team = {
      gettingStarted: {
        ...COMPLETE,
        steps: { ...COMPLETE.steps, team: false },
        complete: false,
      },
      cards: [],
    };
    serve(team);
    const { unmount } = renderWithAuth(routed(<HomePage />), {
      permissions: ['users.create'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).getByText('Invite your team')).toBeTruthy();
    expect(
      within(start)
        .getByRole('link', { name: 'Invite someone' })
        .getAttribute('href'),
    ).toBe('/members?invite');
    unmount();

    // Without users.create, the step and no button (ADR-077).
    serve(team);
    renderWithAuth(routed(<HomePage />), { permissions: [] });
    const theirs = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(theirs).getByText('Invite your team')).toBeTruthy();
    expect(
      within(theirs).queryByRole('link', { name: 'Invite someone' }),
    ).toBeNull();
  });

  it('keeps Skip and Dismiss from those who may not change the settings', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        steps: { ...COMPLETE.steps, team: false },
        complete: false,
      },
      cards: [],
    });
    renderWithAuth(routed(<HomePage />), { permissions: [] });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).queryByRole('button', { name: 'Skip' })).toBeNull();
    expect(within(start).queryByRole('button', { name: 'Dismiss' })).toBeNull();
  });
  // ADR-072's watch list: the note shows only on a computer on another clock.
  describe('the time-zone note', () => {
    afterEach(() => setOrganizationTimeZone(null));

    /** An organization's zone that is not this computer's. */
    const elsewhere = () =>
      browserTimeZone() === 'Pacific/Auckland'
        ? 'America/Vancouver'
        : 'Pacific/Auckland';

    it('says which zone dates follow when this computer is elsewhere', async () => {
      const zone = elsewhere();
      setOrganizationTimeZone(zone);
      serve({ gettingStarted: COMPLETE, cards: [] });
      renderWithAuth(routed(<HomePage />));

      // The organization's zone, by name, never this computer's.
      expect(
        await screen.findByText(
          `Dates follow the organization’s time zone: ${zoneLabel(zone)}.`,
        ),
      ).toBeVisible();
    });

    it('leads whoever may change the zone to it, and nobody else', async () => {
      setOrganizationTimeZone(elsewhere());
      serve({ gettingStarted: COMPLETE, cards: [] });
      const { unmount } = renderWithAuth(routed(<HomePage />), {
        permissions: ['organizations.update'],
      });

      expect(
        await screen.findByRole('link', { name: 'Change the time zone' }),
      ).toHaveAttribute('href', '/settings/organization?tab=profile');
      unmount();

      renderWithAuth(routed(<HomePage />), { permissions: [] });
      expect(
        await screen.findByText(/Dates follow the organization’s time zone/),
      ).toBeVisible();
      expect(
        screen.queryByRole('link', { name: 'Change the time zone' }),
      ).not.toBeInTheDocument();
    });

    it('says nothing when this computer is on the organization’s clock', async () => {
      setOrganizationTimeZone(browserTimeZone());
      serve({ gettingStarted: COMPLETE, cards: [] });
      renderWithAuth(routed(<HomePage />));

      expect(await screen.findByRole('heading', { level: 1 })).toBeVisible();
      expect(
        screen.queryByText(/Dates follow the organization’s time zone/),
      ).not.toBeInTheDocument();
    });
  });
});
