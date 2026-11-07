import { ThemeProvider } from '@mui/material/styles';
import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import type { ReactElement } from 'react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
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
import { GETTING_STARTED_DONE, homeCard, welcome } from '../test/factories';
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
function serve(
  home: Omit<
    HomeResponse,
    'welcome' | 'whatWeDo' | 'recent' | 'defaultLayout'
  > &
    Partial<Pick<HomeResponse, 'recent'>>,
) {
  const response: HomeResponse = {
    welcome: null,
    whatWeDo: null,
    recent: true,
    // The default as these cards come, with none saved.
    defaultLayout: {
      order: home.cards.map((card) => card.kind),
      hidden: home.cards.filter((card) => card.hidden).map((card) => card.kind),
      recent: true,
    },
    ...home,
  };
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
            homeCard({ kind: 'toShip', count: 12, late: 2 }),
            homeCard({ kind: 'costsWaiting', count: 2 }),
          ],
          recent: true,
          defaultLayout: {
            order: ['toShip', 'costsWaiting'],
            hidden: [],
            recent: true,
          },
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
      within(today).getByRole('link', {
        name: 'Stock value · Waiting for a cost, 2',
      }),
    ).toHaveAttribute('href', '/costs#costs');
    expect(within(today).getAllByRole('link')).toHaveLength(2);
  });

  // A tile and the filter it opens share one name, the plainer of the two
  // (ADR-091): each of these is its list's own message.
  it('names each tile as the filter it opens does', async () => {
    server.use(
      http.get('/api/v1/home', () =>
        HttpResponse.json({
          whatWeDo: null,
          gettingStarted: COMPLETE,
          welcome: null,
          cards: [
            homeCard({ kind: 'drafts', count: 3 }),
            homeCard({ kind: 'lowStock', count: 3, anyPoint: true }),
            homeCard({ kind: 'invoicesToIssue', count: 4 }),
            homeCard({ kind: 'returnsOpen', count: 1 }),
            homeCard({ kind: 'production', count: 2 }),
            homeCard({ kind: 'licences', count: 5 }),
          ],
          recent: true,
          defaultLayout: {
            order: [
              'drafts',
              'lowStock',
              'invoicesToIssue',
              'returnsOpen',
              'production',
              'licences',
            ],
            hidden: ['drafts'],
            recent: true,
          },
        } satisfies HomeResponse),
      ),
    );
    renderWithAuth(routed(<HomePage />), {
      permissions: [
        'orders.view',
        'stock.view',
        'invoices.view',
        'return_authorizations.view',
        'production_orders.view',
        'product_licences.view',
      ],
    });

    const today = await screen.findByRole('region', {
      name: 'What needs you today',
    });
    for (const [name, href] of [
      ['Orders · Draft, 3', '/orders?status=draft&order=asc'],
      ['Low stock, 3', '/inventory?tab=reorder-points&status=low'],
      ['Invoices · To issue, 4', '/invoices?status=draft'],
      ['Open returns, 1', '/return-authorizations?status=open'],
      ['Production · In progress, 2', '/production?status=released'],
      ['Licences expiring, 5', '/licences?expiring=1'],
    ]) {
      expect(within(today).getByRole('link', { name })).toHaveAttribute(
        'href',
        href,
      );
    }
  });

  // The ninth tile (ADR-085): red with its out count, opening Reorder
  // points on Low, and its late button on Out.
  it('shows Low stock with its out count, opening Reorder points on Low, and Out from what is late', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        homeCard({ kind: 'lowStock', count: 3, late: 1, anyPoint: true }),
      ],
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
        homeCard({ kind: 'toShip', count: 12, late: 2 }),
        homeCard({ kind: 'toReceive', count: 5 }),
        homeCard({ kind: 'expiring', count: 4, late: 1 }),
        homeCard({ kind: 'licences', count: 1, late: 1 }),
      ],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view', 'stock.view', 'product_licences.view'],
    });

    const late = await screen.findByRole('region', {
      name: '4 things need you now',
    });
    const buttons = within(late).getAllByRole('link');
    expect(
      buttons.map((button) => [
        button.textContent,
        button.getAttribute('href'),
      ]),
    ).toEqual([
      ['2 late orders to ship', '/orders?direction=sale&outstanding=1&late=1'],
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

  /**
   * Customise Home (ADR-091, amended November 2026): a tile the person hid,
   * or hidden by default as Drafts is, is not drawn, but buries nothing:
   * its late items stay in the panel. The line saying where they came from
   * is Customise Home's alone, as the boards draw it.
   */
  it('leaves a hidden tile out, its late still in the panel', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        homeCard({ kind: 'toReceive', count: 5 }),
        homeCard({ kind: 'drafts', hidden: true, count: 3 }),
        homeCard({ kind: 'toShip', hidden: true, count: 12, late: 2 }),
      ],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });

    const late = await screen.findByRole('region', {
      name: '2 things need you now',
    });
    expect(
      within(late).getByRole('link', { name: '2 late orders to ship' }),
    ).toBeVisible();
    // No line under the panel saying where they came from: on Home it is
    // the panel that says so.
    expect(screen.queryByText(/ is hidden; its /)).toBeNull();
    const today = screen.getByRole('region', { name: 'What needs you today' });
    expect(
      within(today)
        .getAllByRole('link')
        .map((tile) => tile.getAttribute('aria-label')),
    ).toEqual(['To receive, 5']);
  });

  // While customised, a tile hidden in the draft says, under the panel,
  // that its late items still show there, one in the singular.
  it('says under the panel, while customised, where a hidden tile’s late items went', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        homeCard({ kind: 'toShip', count: 3, late: 1 }),
        homeCard({ kind: 'toReceive', count: 5 }),
      ],
    });
    const router = createMemoryRouter([{ path: '/', element: <HomePage /> }]);
    renderWithAuth(<RouterProvider router={router} />, {
      permissions: ['orders.view'],
    });
    const user = userEvent.setup();

    await user.click(
      await screen.findByRole('button', { name: 'Customise Home' }),
    );
    const panel = await screen.findByRole('region', { name: 'Customise Home' });
    const line = 'To ship is hidden; its 1 late order still shows here';
    expect(screen.queryByText(line)).toBeNull();
    // Each button names its tile for a screen reader, its word on screen.
    const ship = within(
      within(panel).getByRole('listitem', { name: 'To ship' }),
    );
    expect(
      ship.getByRole('button', { name: 'Move To ship up' }),
    ).toHaveTextContent('Up');
    expect(
      ship.getByRole('button', { name: 'Move To ship down' }),
    ).toHaveTextContent('Down');
    await user.click(ship.getByRole('button', { name: 'Hide To ship' }));
    expect(screen.getByText(line)).toBeVisible();
    expect(
      within(panel).getByRole('button', { name: 'Show To ship' }),
    ).toHaveTextContent('Show');
  });

  /**
   * Recently opened, switched off in Customise Home (ADR-091, amended
   * November 2026): Home neither shows it nor reads it; on, as before.
   */
  it('reads and shows Recently opened only while the person has it on', async () => {
    server.use(
      http.get('/api/v1/recent', () =>
        HttpResponse.json({
          recent: [
            {
              kind: 'order',
              id: 'order-1',
              title: 'SO-000001',
              detail: 'Acme Co',
              openedAt: new Date().toISOString(),
            },
          ],
        }),
      ),
    );
    // The reads this test makes, by fetch: a handler would also count one
    // the test before sent as it ended.
    const fetched = vi.spyOn(globalThis, 'fetch');
    const reads = () =>
      fetched.mock.calls
        .map(([input]) => String(input))
        .filter((url) => url.includes('/v1/recent'));
    const cards: HomeResponse['cards'] = [
      homeCard({ kind: 'toShip', count: 1 }),
    ];

    serve({ gettingStarted: COMPLETE, cards, recent: false });
    const { unmount } = renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view'],
    });
    expect(
      await screen.findByRole('link', { name: 'To ship, 1' }),
    ).toBeTruthy();
    expect(
      screen.queryByRole('region', { name: 'Recently opened' }),
    ).toBeNull();
    expect(reads()).toEqual([]);
    unmount();

    serve({ gettingStarted: COMPLETE, cards });
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });
    expect(
      await screen.findByRole('region', { name: 'Recently opened' }),
    ).toBeVisible();
    expect(reads()).toEqual(['/api/v1/recent?limit=6']);
  });

  it('says nothing is late in one calm line, and nothing needs you when all is done', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [homeCard({ kind: 'toShip', count: 3 })],
    });
    const { unmount } = renderWithAuth(routed(<HomePage />), {
      permissions: ['orders.view'],
    });
    expect(await screen.findByText('Nothing is late today.')).toBeVisible();
    expect(screen.queryByRole('region', { name: /late/ })).toBeNull();
    unmount();

    serve({
      gettingStarted: COMPLETE,
      cards: [homeCard({ kind: 'toShip' })],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['orders.view'] });
    expect(await screen.findByText('Nothing needs you today.')).toBeVisible();
  });

  // A tile with nothing to do stays in its place, quiet, still a link
  // (ADR-091): its words in place of the count.
  it('keeps a tile with nothing to do, quiet and still a link', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [homeCard({ kind: 'lowStock', anyPoint: true })],
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

  // Nothing low is not nothing watched (ADR-085): with no reorder point
  // yet, the tile says so and opens the whole list, where one is set.
  it('says no reorder point is set yet, rather than that nothing is low', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [homeCard({ kind: 'lowStock', anyPoint: false })],
    });
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    const low = await screen.findByRole('link', {
      name: 'Low stock, No reorder points set yet',
    });
    expect(low).toHaveAttribute('href', '/inventory?tab=reorder-points');
    expect(within(low).queryByText('Nothing low')).toBeNull();
  });

  // A server deployed after the tab opened may send a kind this build has
  // never heard of (ADR-081): Home shows the rest, and what is late leaves
  // the newcomer out, rather than crash.
  it('skips a card kind it does not know', async () => {
    serve({
      gettingStarted: COMPLETE,
      cards: [
        homeCard({ kind: 'toShip', count: 1 }),
        homeCard({
          kind: 'fromANewerServer' as string as HomeKind,
          count: 4,
          late: 2,
        }),
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
      cards: [homeCard({ kind: 'toShip', count: 2, late: 1 })],
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
      name: '1 thing needs you now',
    });
    const { color, backgroundColor } = getComputedStyle(late);
    expect(color).toBe('var(--mui-palette-tone-critical-fg)');
    for (const mode of ['light', 'dark'] as const) {
      expect(
        contrast(drawnIn(mode, color), drawnIn(mode, backgroundColor)),
      ).toBeGreaterThanOrEqual(4.5);
    }
  });

  /**
   * The main action (ADR-091): the first the role may take of Raise an
   * order, Receive stock, Plan a run and Trace a lot, in the accent, in the
   * greeting's row; the others under More, a menu; with none other, no
   * More. Refresh is an icon beside the greeting.
   */
  it('leads with the first action the role may take, the others under More', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    const user = userEvent.setup();
    renderWithAuth(routed(<HomePage />), {
      permissions: ['stock.view', 'stock.move', 'production.create'],
    });

    const receive = await screen.findByRole('link', { name: 'Receive stock' });
    expect(receive).toHaveClass('MuiButton-contained');
    expect(screen.queryByRole('link', { name: 'Raise an order' })).toBeNull();
    // Above what is late, beside the greeting.
    const follows = (first: Element, then: Element) =>
      !!(
        first.compareDocumentPosition(then) & Node.DOCUMENT_POSITION_FOLLOWING
      );
    expect(
      follows(receive, await screen.findByText('Nothing needs you today.')),
    ).toBe(true);
    expect(screen.getByRole('button', { name: 'Refresh' })).toBeVisible();

    const more = screen.getByRole('button', { name: 'More' });
    expect(more).toHaveAttribute('aria-haspopup', 'menu');
    await user.click(more);
    const menu = screen.getByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Plan a run', 'Trace a lot']);
    expect(more).toHaveAttribute('aria-expanded', 'true');
  });

  it('shows no More where the role may take one action alone', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['stock.view', 'production.create'],
    });

    expect(await screen.findByRole('link', { name: 'Plan a run' })).toHaveClass(
      'MuiButton-contained',
    );
    expect(screen.getByRole('button', { name: 'More' })).toBeVisible();
  });

  // Whom to ask is read beside Home's own read, not after it, and the line
  // waits for the names rather than change under the reader (ADR-091's
  // review).
  it('reads whom to ask beside Home, the line once with its names', async () => {
    server.use(
      http.get('/api/v1/home', () => new Promise<never>(() => undefined)),
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
  });

  // Trace a lot is never the main action alone (ADR-091's review): a
  // Viewer has the quiet line and whom to ask, as a role with none does.
  it('gives a role that may only trace a lot the line, not the button', async () => {
    serve({ gettingStarted: COMPLETE, cards: [] });
    server.use(
      http.get('/api/v1/account/membership', () =>
        HttpResponse.json(welcome().access),
      ),
    );
    renderWithAuth(routed(<HomePage />), { permissions: ['stock.view'] });

    expect(
      await screen.findByText(
        'Your role does not include raising orders, receiving stock or planning runs. To do more, ask Mei Lin or David Park.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('link', { name: 'Trace a lot' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
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

    it('from the main action and each of More', async () => {
      serve({ gettingStarted: COMPLETE, cards: [] });
      atHome(['stock.view', 'stock.move', 'production.create']);

      await userEvent.click(
        await screen.findByRole('link', { name: 'Receive stock' }),
      );
      await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      for (const name of ['Plan a run', 'Trace a lot']) {
        await userEvent.click(
          await screen.findByRole('button', { name: 'More' }),
        );
        await userEvent.click(screen.getByRole('menuitem', { name }));
        await userEvent.click(screen.getByRole('button', { name: 'Back' }));
      }

      expect(
        await screen.findByRole('link', { name: 'Receive stock' }),
      ).toBeVisible();
    });

    it('from a tile and from a late button', async () => {
      serve({
        gettingStarted: COMPLETE,
        cards: [homeCard({ kind: 'toShip', count: 3, late: 1 })],
      });
      atHome(['orders.view']);

      for (const name of ['To ship, 3, 1 late', '1 late order to ship']) {
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
          recent: true,
          defaultLayout: { order: [], hidden: [], recent: true },
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

  it('leads a new organization with Getting started: the next step its main action, every other step one link', async () => {
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
      cards: [homeCard({ kind: 'toShip' })],
    });
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.view', 'users.create'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(within(start).getByText('2 of 7 done')).toBeVisible();
    // Said once, inside the card it is about (ADR-091).
    expect(
      within(start).getByText(/^Seven steps get your organization ready/),
    ).toBeVisible();
    expect(within(start).getByRole('button', { name: 'Dismiss' })).toBeTruthy();

    // A done step: ticked and grey, still a link to where it was done.
    expect(
      within(start).getByRole('link', { name: /^Your organization · Done/ }),
    ).toHaveAttribute('href', '/settings/organization');
    // The next: its button the one filled (Learn more beside it, which
    // needs Help's frame, is help.spec's).
    expect(
      within(start).getByRole('link', { name: 'Add a product' }),
    ).toHaveClass('MuiButton-contained');
    // Every other step one link, its whole row, title and hint.
    expect(
      within(start).getByRole('link', {
        name: /^Add a partner\s*A customer you sell to/,
      }),
    ).toHaveAttribute('href', '/partners');
    expect(
      within(start).getByRole('link', { name: /^Invite your team/ }),
    ).toHaveAttribute('href', '/members?invite');
    // Skip only once the team step is the next.
    expect(within(start).queryByRole('button', { name: 'Skip' })).toBeNull();

    // Nothing to do yet: the tiles stay in their places, quiet (ADR-091).
    expect(
      screen.getByRole('link', { name: 'To ship, No orders to ship' }),
    ).toBeVisible();
    expect(screen.getByText('Nothing needs you today.')).toBeVisible();
  });

  it('offers Skip on the team step once it is the next, and no link to invite without users.create', async () => {
    serve({
      gettingStarted: {
        ...COMPLETE,
        steps: { ...COMPLETE.steps, team: false },
        complete: false,
      },
      cards: [],
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
      permissions: ['organizations.update'],
    });

    const start = await screen.findByRole('region', {
      name: 'Getting started',
    });
    expect(
      within(start).queryByRole('link', { name: 'Invite someone' }),
    ).toBeNull();
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
    // No main action beside it: a new organization has nothing to raise
    // an order for yet (ADR-091's review).
    expect(
      screen
        .queryAllByRole('link', { name: 'Raise an order' })
        .filter((link) => !start.contains(link)),
    ).toHaveLength(0);
    expect(screen.queryByRole('button', { name: 'More' })).toBeNull();
  });

  it('puts Getting started straight after the welcome, with no main action while it shows', async () => {
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
    expect(follows(card, start)).toBe(true);
    // Both above what is late, as the boards draw them (ADR-091's review).
    expect(follows(start, screen.getByText('Nothing needs you today.'))).toBe(
      true,
    );
    // Getting started's next step is the page's one main action.
    expect(
      screen
        .queryAllByRole('link', { name: 'Raise an order' })
        .filter((link) => !start.contains(link)),
    ).toHaveLength(0);
    unmount();

    // Without Getting started, the main action in the accent, above the
    // welcome.
    respond(GETTING_STARTED_DONE);
    renderWithAuth(routed(<HomePage />), {
      permissions: ['organizations.update', 'orders.create'],
    });
    const alone = await screen.findByRole('region', { name: /^Welcome to/ });
    expect(
      screen.queryByRole('region', { name: 'Getting started' }),
    ).toBeNull();
    const main = screen.getByRole('link', { name: 'Raise an order' });
    expect(follows(main, alone)).toBe(true);
    expect(main).toHaveClass('MuiButton-contained');
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
