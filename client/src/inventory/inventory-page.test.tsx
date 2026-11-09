import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { StockRow } from '../api/types.gen';
import { OFFER_BACK } from '../lib/offer-back';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';
import { LotSearchPage } from './lot-trace-page';

const ROW: StockRow = {
  id: 'stock-1',
  variantId: 'variant-1',
  sku: 'VITD-60',
  productName: 'Vitamin D',
  variantName: '60ct',
  coverFileId: null,
  unitOfMeasure: 'each',
  locationId: 'loc-1',
  locationName: 'Shelf A',
  locationCode: 'A-01',
  lotId: 'lot-1',
  lotCode: 'NN-2410-07',
  lotExpiresAt: '2027-10-01',
  lotIsAssigned: false,
  quantity: '120.0000',
};

const CHANGES = ['Move', 'Ship out', 'Send sample', 'Edit lot details'];

describe('InventoryPage', () => {
  /** The page with one row, and that row's ⋯. */
  async function rowActions(permissions: string[]) {
    server.use(
      http.get('/api/v1/stock', () =>
        HttpResponse.json({ entries: [ROW], nextCursor: null }),
      ),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
      { permissions },
    );
    return screen.findByRole('button', {
      name: 'Actions for VITD-60 at Shelf A',
    });
  }

  async function openActions(permissions: string[]) {
    await userEvent.click(await rowActions(permissions));
  }

  // A screen reader hears a menu button, not a plain one (#358).
  it('says a row’s ⋯ opens a menu, and whether it is open', async () => {
    const actions = await rowActions(['stock.view']);
    expect(actions).toHaveAttribute('aria-haspopup', 'menu');
    expect(actions).toHaveAttribute('aria-expanded', 'false');
    expect(actions).not.toHaveAttribute('aria-controls');

    await userEvent.click(actions);
    const menu = await screen.findByRole('menu');
    expect(actions).toHaveAttribute('aria-expanded', 'true');
    const controls = actions.getAttribute('aria-controls');
    expect(controls && document.getElementById(controls)).toContainElement(
      menu,
    );
  });

  // A Viewer's first week asks them to look a lot up (ADR-079).
  it('gives someone who may only see stock the actions that read', async () => {
    await openActions(['stock.view']);

    expect(
      screen.getByRole('menuitem', { name: 'Trace lot' }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('menuitem', { name: 'History' }),
    ).toBeInTheDocument();
    for (const name of [...CHANGES, 'Correct the count']) {
      expect(screen.queryByRole('menuitem', { name })).not.toBeInTheDocument();
    }
  });

  it('adds what changes stock for someone who may move it, and correcting for someone who may adjust', async () => {
    await openActions(['stock.view', 'stock.move']);

    for (const name of CHANGES) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    expect(
      screen.queryByRole('menuitem', { name: 'Correct the count' }),
    ).not.toBeInTheDocument();
  });

  it('offers Correct the count with both permissions', async () => {
    await openActions(['stock.view', 'stock.move', 'stock.adjust']);

    expect(
      screen.getByRole('menuitem', { name: 'Correct the count' }),
    ).toBeInTheDocument();
  });

  it('shows only why a first read failed, with Try again, never Nothing here yet. (#195)', async () => {
    let reads = 0;
    server.use(
      http.get('/api/v1/stock', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json({ entries: [], nextCursor: null });
      }),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Internal server error');
    expect(screen.queryByText('Nothing here yet.')).not.toBeInTheDocument();

    await userEvent.click(
      within(failed).getByRole('button', { name: 'Try again' }),
    );
    expect(await screen.findByText('Nothing here yet.')).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  // Named in the reader's language beside the SKU, as Stock names it (#296).
  it('names each item promised to customers beside its SKU', async () => {
    server.use(
      http.get('/api/v1/stock', () =>
        HttpResponse.json({ entries: [ROW], nextCursor: null }),
      ),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () =>
        HttpResponse.json([
          {
            variantId: 'variant-1',
            sku: 'VITD-60',
            productName: '维生素 D',
            variantName: '60 粒',
            unitOfMeasure: 'each',
            onHand: '120.0000',
            held: '24.0000',
            free: '96.0000',
            backordered: '0.0000',
          },
        ]),
      ),
    );
    renderWithAuth(
      <MemoryRouter>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    const promised = (
      await screen.findByRole('heading', { name: 'Promised to customers' })
    ).parentElement as HTMLElement;
    const row = within(promised).getAllByRole('row')[1];
    expect(within(row).getByRole('cell', { name: 'VITD-60' })).toBeVisible();
    expect(
      within(row).getByRole('cell', { name: '维生素 D (60 粒)' }),
    ).toBeVisible();
    expect(
      within(promised).getByRole('columnheader', { name: 'Item' }),
    ).toBeVisible();
  });

  // Home's Receive stock opens the dialog, not only the list (#502).
  it('opens Receive stock from ?receive; closing keeps the list, Back returns Home', async () => {
    server.use(
      http.get('/api/v1/stock', () =>
        HttpResponse.json({ entries: [ROW], nextCursor: null }),
      ),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    function Address() {
      const { search } = useLocation();
      return <output aria-label="address">{search}</output>;
    }
    renderWithAuth(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route
            path="/"
            element={
              <Link to="/inventory?receive" state={OFFER_BACK}>
                Receive
              </Link>
            }
          />
          <Route
            path="/inventory"
            element={
              <>
                <InventoryPage />
                <Address />
              </>
            }
          />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view', 'stock.move', 'locations.view'] },
    );

    await userEvent.click(screen.getByRole('link', { name: 'Receive' }));
    const dialog = await screen.findByRole('dialog', { name: 'Receive stock' });
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Cancel' }),
    );

    await expect
      .poll(() => screen.queryByRole('dialog', { name: 'Receive stock' }))
      .toBeNull();
    expect(screen.getByText('VITD-60')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'address' }),
    ).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('link', { name: 'Receive' })).toBeVisible();
  });

  // Trace a lot is a top-level page: Back returns here (#341).
  it('opens Trace a lot with Back to Inventory', async () => {
    server.use(
      http.get('/api/v1/stock', () =>
        HttpResponse.json({ entries: [ROW], nextCursor: null }),
      ),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 0, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/lots" element={<LotSearchPage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );
    await screen.findByText('VITD-60');

    await userEvent.click(screen.getByRole('link', { name: 'Trace a lot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('VITD-60')).toBeVisible();
  });

  /**
   * Expiring soon lists the soonest first whenever it is on (ADR-091): the
   * panel's senior stopped at which lot expires first.
   */
  it('sorts Expiring soon by expiry, soonest first, until a header is chosen', async () => {
    const user = userEvent.setup();
    const asked: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/stock', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({ entries: [ROW], nextCursor: null });
      }),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 1, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory?expiring=1']}>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );
    await screen.findByText('VITD-60');

    expect(Object.fromEntries(asked[0])).toMatchObject({
      expiringWithin: '90',
      sort: 'expiry',
      order: 'asc',
    });
    expect(
      screen.getByRole('columnheader', { name: 'Expires' }),
    ).toHaveAttribute('aria-sort', 'ascending');

    // Off, the list is in its own order again; on, soonest first again.
    const expiring = screen.getByRole('button', { name: /Expiring soon/ });
    await user.click(expiring);
    await expect.poll(() => asked.at(-1)?.has('expiringWithin')).toBe(false);
    expect(asked.at(-1)?.has('sort')).toBe(false);
    await user.click(expiring);
    await expect.poll(() => asked.at(-1)?.get('sort')).toBe('expiry');

    // The header chosen replaces it: the latest first.
    await user.click(screen.getByRole('button', { name: 'Expires' }));
    await expect.poll(() => asked.at(-1)?.get('order')).toBe('desc');
  });

  /**
   * Home's late button for Expiring soon opens the expired lots alone
   * (ADR-091), soonest first, Expired a chip that clears it.
   */
  it('lists the expired when the address asks, soonest first, until cleared', async () => {
    const user = userEvent.setup();
    const asked: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/stock', ({ request }) => {
        asked.push(new URL(request.url).searchParams);
        return HttpResponse.json({ entries: [ROW], nextCursor: null });
      }),
      http.get('/api/v1/stock/counts', () =>
        HttpResponse.json({ expiring: 1, needsCost: 0 }),
      ),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory?expiring=1&expired=1']}>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    const chip = await screen.findByRole('button', { name: 'Expired' });
    await expect.poll(() => asked.length).toBeGreaterThan(0);
    expect(Object.fromEntries(asked[0])).toMatchObject({
      expiringWithin: '90',
      expired: 'true',
      sort: 'expiry',
      order: 'asc',
    });

    // Cleared, every lot expiring soon, still soonest first.
    chip.focus();
    await user.keyboard('{Delete}');
    expect(
      screen.queryByRole('button', { name: 'Expired' }),
    ).not.toBeInTheDocument();
    await expect.poll(() => asked.at(-1)?.has('expired')).toBe(false);
    expect(asked.at(-1)?.get('sort')).toBe('expiry');
  });

  // A row's stock on Items (ADR-092): the item alone, every variant in
  // every location, its counts too, named on a chip whose × removes it.
  it('lists one item alone when the address names it, named on a chip that removes it', async () => {
    const user = userEvent.setup();
    const ITEM = '00000000-0000-4000-8000-000000000001';
    const asked: { stock: URLSearchParams[]; counts: URLSearchParams[] } = {
      stock: [],
      counts: [],
    };
    server.use(
      http.get('/api/v1/stock', ({ request }) => {
        asked.stock.push(new URL(request.url).searchParams);
        return HttpResponse.json({ entries: [ROW], nextCursor: null });
      }),
      http.get('/api/v1/stock/counts', ({ request }) => {
        asked.counts.push(new URL(request.url).searchParams);
        return HttpResponse.json({ expiring: 0, needsCost: 0 });
      }),
      http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
      http.get(`/api/v1/products/${ITEM}`, () =>
        // The item itself, as GET /v1/products/:id answers.
        HttpResponse.json({ displayName: 'Vitamin D' }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={[`/inventory?productId=${ITEM}`]}>
        <InventoryPage />
      </MemoryRouter>,
      { permissions: ['stock.view', 'products.view'] },
    );

    const chip = await screen.findByRole('button', {
      name: 'Item: Vitamin D',
    });
    expect(asked.stock[0].get('productId')).toBe(ITEM);
    await expect.poll(() => asked.counts[0]?.get('productId')).toBe(ITEM);

    await user.click(within(chip).getByTestId('CancelIcon'));
    await expect.poll(() => asked.stock.at(-1)?.has('productId')).toBe(false);
    expect(
      screen.queryByRole('button', { name: 'Item: Vitamin D' }),
    ).not.toBeInTheDocument();
  });

  describe('the search', () => {
    function answer() {
      const asked: Record<'stock' | 'points', (string | null)[]> = {
        stock: [],
        points: [],
      };
      server.use(
        http.get('/api/v1/stock', ({ request }) => {
          asked.stock.push(new URL(request.url).searchParams.get('search'));
          return HttpResponse.json({ entries: [ROW], nextCursor: null });
        }),
        http.get('/api/v1/stock/counts', () =>
          HttpResponse.json({ expiring: 0, needsCost: 0 }),
        ),
        http.get('/api/v1/stock/availability', () => HttpResponse.json([])),
        http.get('/api/v1/stock/reorder-points', ({ request }) => {
          asked.points.push(new URL(request.url).searchParams.get('search'));
          return HttpResponse.json({ entries: [], nextCursor: null });
        }),
        http.get('/api/v1/stock/reorder-points/counts', () =>
          HttpResponse.json({ all: 0, low: 0, out: 0 }),
        ),
      );
      return asked;
    }

    it('follows the address while open, as Show all in the lookup changes it', async () => {
      const asked = answer();
      renderWithAuth(
        <MemoryRouter initialEntries={['/inventory']}>
          <Link to="/inventory?search=NN-2410">Show all</Link>
          <InventoryPage />
        </MemoryRouter>,
        { permissions: ['stock.view'] },
      );
      await screen.findByText('VITD-60');

      await userEvent.click(screen.getByRole('link', { name: 'Show all' }));

      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue(
        'NN-2410',
      );
      await expect.poll(() => asked.stock.at(-1)).toBe('NN-2410');
    });

    it('is one search on Stock and Reorder points, either way', async () => {
      const user = userEvent.setup();
      const asked = answer();
      renderWithAuth(
        <MemoryRouter initialEntries={['/inventory']}>
          <InventoryPage />
        </MemoryRouter>,
        { permissions: ['stock.view'] },
      );
      await screen.findByText('VITD-60');

      await user.type(
        screen.getByRole('searchbox', { name: 'Search' }),
        'vitd',
      );
      await expect.poll(() => asked.stock.at(-1)).toBe('vitd');
      await user.click(screen.getByRole('tab', { name: 'Reorder points' }));

      const box = screen.getByRole('searchbox', { name: 'Search' });
      expect(box).toHaveValue('vitd');
      await expect.poll(() => asked.points).toEqual(['vitd']);

      await user.clear(box);
      await user.type(box, 'd3');
      await expect.poll(() => asked.points.at(-1)).toBe('d3');
      await user.click(screen.getByRole('tab', { name: 'Stock' }));

      expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue(
        'd3',
      );
      await expect.poll(() => asked.stock.at(-1)).toBe('d3');
    });
  });
});
