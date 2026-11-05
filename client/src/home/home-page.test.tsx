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
import { browserTimeZone, setOrganizationTimeZone } from '../lib/time-zone';
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

/** Home for a member past their first two weeks: no welcome (ADR-079). */
function serve(home: Omit<HomeResponse, 'welcome'>) {
  const response: HomeResponse = { ...home, welcome: null };
  server.use(http.get('/api/v1/home', () => HttpResponse.json(response)));
}

describe('HomePage', () => {
  it('greets, sums up, and shows each card with its See all, and no rows', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        { kind: 'toShip', count: 3, late: 1 },
        { kind: 'costsWaiting', count: 0, late: 0 },
      ],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view', 'costs.view'],
    });

    expect(
      await screen.findByText('3 things need attention, 1 of them overdue.'),
    ).toBeTruthy();
    expect(screen.getByRole('heading', { level: 1 }).textContent).toMatch(
      /^Good (morning|afternoon|evening), Owner$/,
    );
    // The day, then the organization, a space either side of the dot.
    expect(screen.getByText(/ · Alpha Co$/)).toBeVisible();

    const ship = screen.getByRole('region', { name: 'To ship' });
    expect(
      within(ship)
        .getByRole('link', { name: 'See all 3' })
        .getAttribute('href'),
    ).toBe('/orders?direction=sale&status=confirmed&outstanding=1');
    // Its rows are the list's (ADR-091): See all is the card's one link.
    expect(within(ship).getAllByRole('link')).toHaveLength(1);

    // A card with nothing to do says so, quietly, rather than disappearing.
    const costs = screen.getByRole('region', { name: 'Costs waiting' });
    expect(
      within(costs).getByText('Nothing waiting. Every receipt has a cost.'),
    ).toBeTruthy();
  });

  // The ninth card (ADR-085): red with its out count, See all opening
  // Reorder points on Low.
  it('shows Low stock, red with its out count, opening Reorder points on Low', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'lowStock', count: 3, late: 1 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    expect(await screen.findByText('1 out')).toBeTruthy();
    const low = screen.getByRole('region', { name: 'Low stock' });
    expect(
      within(low).getByRole('link', { name: 'See all 3' }).getAttribute('href'),
    ).toBe('/inventory?tab=reorder-points&status=low');
  });

  // Waiting for a cost (ADR-091): Stock value's list, whose rows the
  // server counts, and where a cost is set.
  it('opens Stock value from Costs waiting', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'costsWaiting', count: 2, late: 0 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['costs.view'] });

    const costs = await screen.findByRole('region', { name: 'Costs waiting' });
    expect(
      within(costs).getByRole('link', { name: 'See all 2' }),
    ).toHaveAttribute('href', '/costs');
  });

  it('says when nothing is low, with no See all', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'lowStock', count: 0, late: 0 }],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    const low = await screen.findByRole('region', { name: 'Low stock' });
    expect(within(low).getByText('Nothing is low.')).toBeTruthy();
    expect(within(low).queryByRole('link')).toBeNull();
  });

  // A server deployed after the tab opened may send a kind this build has
  // never heard of (ADR-081): Home shows the rest, and its sentence leaves
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

    expect(await screen.findByText('1 thing needs attention.')).toBeTruthy();
    expect(screen.getByRole('region', { name: 'To ship' })).toBeTruthy();
    expect(document.getElementById('fromANewerServer')).toBeNull();
  });

  // The positive tone's text (ADR-081). It asked for MUI's success.dark,
  // 4.33 : 1 on a dark card, through Typography's color prop, which takes
  // a palette name rather than a path and so drew the plain text instead.
  it('draws an empty card’s line in the positive tone, at 4.5 : 1 in both modes', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'production', count: 0, late: 0 }],
    });
    renderWithAuth(
      routed(
        <ThemeProvider theme={themeFor('en')}>
          <HomePage />
        </ThemeProvider>,
      ),
      { permissions: ['production.view'] },
    );

    const card = await screen.findByRole('region', { name: 'In production' });
    const { color } = getComputedStyle(
      within(card).getByText('No runs in progress.'),
    );
    expect(color).toBe('var(--mui-palette-tone-positive-fg)');
    for (const mode of ['light', 'dark'] as const) {
      expect(
        contrast(
          drawnIn(mode, color),
          drawnIn(mode, getComputedStyle(card).backgroundColor),
        ),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  // Grey, as the words around it are, so underlined to say it is a link
  // (conventions.md, The look).
  it('underlines Change the days, for whoever may change them', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [{ kind: 'expiring', count: 0, late: 0 }],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update'],
    });

    const link = await screen.findByRole('link', { name: 'Change the days' });
    expect(link).toHaveAttribute('href', '/settings/organization?tab=stock');
    expect(getComputedStyle(link).textDecoration).toMatch(/underline/);
  });

  it('offers only the quick actions the role may take', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    expect(
      await screen.findByRole('link', { name: 'Trace a lot' }),
    ).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Raise an order' })).toBeNull();
  });

  /**
   * A link from Home to a top-level page offers Back to Home (#341): each
   * quick action, a card's See all, and a step of Getting started.
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

    it('from a card’s See all', async () => {
      serve({
        gettingStarted: COMPLETE,
        cards: [{ kind: 'toShip', count: 3, late: 0 }],
      });
      atHome(['orders.view']);

      await userEvent.click(
        await screen.findByRole('link', { name: 'See all 3' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));

      expect(
        await screen.findByRole('link', { name: 'See all 3' }),
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
          gettingStarted: COMPLETE,
          welcome: null,
          cards: [],
        } satisfies HomeResponse);
      }),
    );
    renderWithAuth(routed(<HomePage />));

    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.MuiSkeleton-root')).not.toBeNull(),
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
    // Nothing to do yet, so the empty cards stay out of the way.
    expect(screen.queryByRole('region', { name: 'To ship' })).toBeNull();

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
    expect(quick[0]).toHaveClass('MuiButton-outlined');
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
