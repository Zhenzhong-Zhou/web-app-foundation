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
import { describe, expect, it, vi } from 'vitest';

import type { StockCodeRow, StockPlace } from '../api/types.gen';
import { OFFER_BACK } from '../lib/offer-back';
import { apiError } from '../test/handlers';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';
import { LotSearchPage } from './lot-trace-page';

const PRODUCT = '00000000-0000-4000-8000-000000000001';
const PLACE = '00000000-0000-4000-8000-000000000009';

/** A code with stock in two places, part of it not usable, and short. */
const CODE: StockCodeRow = {
  variantId: 'variant-1',
  productId: PRODUCT,
  type: 'good',
  coverFileId: null,
  sku: 'VITD-60',
  productName: 'Vitamin D',
  variantName: '60ct',
  unitOfMeasure: 'each',
  places: 2,
  lots: 2,
  onHand: '42.0000',
  usable: '30.0000',
  notUsable: '12.0000',
  expired: '12.0000',
  issued: '0.0000',
  unavailable: '12.0000',
  held: '30.0000',
  free: '0.0000',
  short: '20.0000',
  coming: '0.0000',
  comingOn: null,
  position: '10.0000',
  expiresFirst: '2027-10-01',
  reorderPoint: '36.0000',
  status: 'low',
  needsCost: false,
  here: null,
};

/** One pile, a lot at a place, as a place's lots carry it. */
function pile(id: string, lot: string, expiresAt: string | null, at: string) {
  return {
    id,
    variantId: 'variant-1',
    sku: 'VITD-60',
    productName: 'Vitamin D',
    variantName: '60ct',
    unitOfMeasure: 'each',
    locationId: at === 'Shelf A' ? 'loc-1' : 'loc-2',
    locationName: at,
    locationCode: null,
    lotId: `lot-${id}`,
    lotCode: lot,
    lotExpiresAt: expiresAt,
    lotIsAssigned: false,
    quantity: '10.0000',
  };
}

const PLACES: StockPlace[] = [
  {
    locationId: 'loc-2',
    locationName: 'Quarantine',
    locationCode: null,
    isAvailable: false,
    onHand: '12.0000',
    lots: [pile('3', 'NN-2401', '2026-01-01', 'Quarantine')],
  },
  {
    locationId: 'loc-1',
    locationName: 'Shelf A',
    locationCode: null,
    isAvailable: true,
    onHand: '30.0000',
    lots: [
      pile('1', 'NN-2410-07', '2027-10-01', 'Shelf A'),
      pile('2', 'NN-2412-01', null, 'Shelf A'),
    ],
  },
];

const COUNTS = { low: 1, out: 0, expiring: 0, expired: 0, needsCost: 0 };

/**
 * The grouped read answering with these rows, its counts and the code's
 * places, each query asked kept.
 */
function answer(entries: StockCodeRow[] = [CODE]) {
  const asked: Record<
    'codes' | 'counts' | 'lots' | 'lotCounts',
    URLSearchParams[]
  > = {
    codes: [],
    counts: [],
    lots: [],
    lotCounts: [],
  };
  server.use(
    http.get('/api/v1/stock/by-code', ({ request }) => {
      asked.codes.push(new URL(request.url).searchParams);
      return HttpResponse.json({ entries, nextCursor: null });
    }),
    http.get('/api/v1/stock/by-code/counts', ({ request }) => {
      asked.counts.push(new URL(request.url).searchParams);
      return HttpResponse.json(COUNTS);
    }),
    http.get('/api/v1/stock/by-code/variant-1/places', () =>
      HttpResponse.json({ places: PLACES }),
    ),
    http.get('/api/v1/stock/by-lot', ({ request }) => {
      asked.lots.push(new URL(request.url).searchParams);
      return HttpResponse.json({ entries: [], nextCursor: null });
    }),
    http.get('/api/v1/stock/by-lot/counts', ({ request }) => {
      asked.lotCounts.push(new URL(request.url).searchParams);
      return HttpResponse.json({
        low: 2,
        expiring: 1,
        expired: 1,
        needsCost: 0,
      });
    }),
  );
  return asked;
}

function renderAt(address: string, permissions: string[]) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <InventoryPage />
    </MemoryRouter>,
    { permissions },
  );
}

const CHANGES = ['Move', 'Ship out', 'Send sample', 'Edit lot details'];

describe('InventoryPage', () => {
  // A failed read of the places says so, with Try again, and keeps the
  // place the address names; it is never "Add a location" (review 51).
  it('shows a failed read of the places, never "Add a location"', async () => {
    const asked = answer();
    let reads = 0;
    server.use(
      http.get('/api/v1/locations', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json([]);
      }),
    );
    renderAt(`/inventory?locationId=${PLACE}`, [
      'stock.view',
      'stock.move',
      'locations.view',
    ]);

    expect(await screen.findByText('Internal server error')).toBeVisible();
    expect(
      screen.queryByText(/Add a location before receiving stock/),
    ).toBeNull();
    // The place in the address is kept while the places cannot be read.
    expect(asked.codes.at(-1)?.get('locationId')).toBe(PLACE);

    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));

    // Read again, and answered with none: now it says to add one.
    expect(
      await screen.findByText(/Add a location before receiving stock/),
    ).toBeVisible();
    expect(screen.queryByText('Internal server error')).toBeNull();
    expect(reads).toBe(2);
  });

  describe('a row per code', () => {
    it('draws its figures and the lines behind them, each a link to its item', async () => {
      answer();
      renderAt('/inventory', ['stock.view', 'locations.view']);

      const name = await screen.findByRole('link', {
        name: 'Vitamin D (60ct)',
      });
      expect(name).toHaveAttribute('href', `/items/${PRODUCT}`);
      expect(screen.getByText('VITD-60 · Product')).toBeVisible();
      expect(screen.getByText('12 not usable')).toBeVisible();
      // 20 short opens the item's page at Held (16a).
      expect(screen.getByRole('link', { name: '20 short' })).toHaveAttribute(
        'href',
        `/items/${PRODUCT}#held`,
      );
      expect(
        screen.getByRole('link', { name: '10 left · reorder at 36' }),
      ).toHaveAttribute('href', `/items/${PRODUCT}#stock`);
      expect(screen.getByText('Low')).toBeVisible();
      // The quick filters with their counts (R3).
      expect(
        await screen.findByRole('button', { name: /Low stock\s*1/ }),
      ).toBeVisible();
    });

    it('opens to its places, then a place to its lots, soonest first, by a button with its words', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view', 'locations.view']);

      const places = await screen.findByRole('button', {
        name: '2 places: show where Vitamin D (60ct) is',
      });
      expect(places).toHaveAttribute('aria-expanded', 'false');
      await user.click(places);

      expect(places).toHaveAttribute('aria-expanded', 'true');
      expect(places).toHaveAccessibleName(
        '2 places: hide where Vitamin D (60ct) is',
      );
      expect(places).toHaveFocus();
      expect(await screen.findByText('Shelf A')).toBeVisible();
      expect(
        screen.getByText('Not usable: a place not available'),
      ).toBeVisible();

      await user.click(
        screen.getByRole('button', {
          name: '2 lots: show the lots at Shelf A',
        }),
      );
      const lots = screen
        .getAllByRole('link')
        .map((link) => link.textContent)
        .filter((text) => text?.startsWith('NN-24'));
      // Soonest first, the lot with no expiry last.
      expect(lots).toEqual(['NN-2410-07', 'NN-2412-01']);
      expect(screen.getByRole('link', { name: 'NN-2410-07' })).toHaveAttribute(
        'href',
        '/lots/lot-1',
      );
    });

    it('opens straight to the lots for a reader without places, never naming a place', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view']);

      await user.click(
        await screen.findByRole('button', {
          name: '2 lots: show where Vitamin D (60ct) is',
        }),
      );
      expect(await screen.findByText('NN-2410-07')).toBeVisible();
      expect(screen.queryByText('Shelf A')).not.toBeInTheDocument();
      expect(
        screen.queryByRole('combobox', { name: 'Location' }),
      ).not.toBeInTheDocument();
    });

    // A screen reader hears a menu button, not a plain one (#358).
    it('says a row’s Actions open a menu, its Movements for everyone and nothing that changes stock', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view']);

      const actions = await screen.findByRole('button', {
        name: 'Actions for VITD-60',
      });
      expect(actions).toHaveAttribute('aria-haspopup', 'menu');
      expect(actions).toHaveAttribute('aria-expanded', 'false');
      await user.click(actions);
      const menu = await screen.findByRole('menu');
      expect(actions).toHaveAttribute('aria-expanded', 'true');
      expect(
        within(menu).getByRole('menuitem', { name: 'Movements' }),
      ).toBeVisible();
      for (const name of [
        'Move',
        'Correct the count',
        'Change reorder point',
      ]) {
        expect(
          within(menu).queryByRole('menuitem', { name }),
        ).not.toBeInTheDocument();
      }
    });
  });

  describe('an item’s own actions', () => {
    /** The Actions of VITD-60's row, opened. */
    async function codeActions(permissions: string[], row = CODE) {
      const user = userEvent.setup();
      answer([row]);
      renderAt('/inventory', ['stock.view', 'locations.view', ...permissions]);
      await user.click(
        await screen.findByRole('button', { name: 'Actions for VITD-60' }),
      );
      return { user, menu: await screen.findByRole('menu') };
    }

    it('offers what changes stock and the reorder point, by permission', async () => {
      const { menu } = await codeActions([
        'stock.move',
        'stock.adjust',
        'stock.reorder',
      ]);

      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Movements',
        'Move',
        'Ship out',
        'Send sample',
        'Correct the count',
        'Change reorder point',
      ]);
    });

    // The row's status and the counts come from the point: read again
    // once it is saved (review 59).
    it('reads the row and the counts again once a reorder point is saved', async () => {
      const point = {
        point: {
          source: 'bought',
          reorderPoint: '36.0000',
          rule: 'fixed',
          fixedQuantity: '12.0000',
          maximumQuantity: null,
        },
        usable: [],
        expired: '0.0000',
        issued: '0.0000',
        coming: [],
        stillNeeded: [],
      };
      const asked = answer();
      server.use(
        http.get('/api/v1/stock/reorder-points/:variantId/preview', () =>
          HttpResponse.json({
            position: '10.0000',
            status: 'low',
            suggestion: '36.0000',
            suggestedMultiples: '3',
            drafted: false,
            inDraft: '0.0000',
            after: '46.0000',
            afterStatus: 'enough',
          }),
        ),
        http.get('/api/v1/stock/reorder-points/:variantId', () =>
          HttpResponse.json(point),
        ),
        http.put('/api/v1/stock/reorder-points/:variantId', () =>
          HttpResponse.json(point.point),
        ),
      );
      const user = userEvent.setup();
      renderAt('/inventory', ['stock.view', 'stock.reorder']);
      await user.click(
        await screen.findByRole('button', { name: 'Actions for VITD-60' }),
      );
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Change reorder point',
        }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Edit reorder point',
      });
      const codes = asked.codes.length;
      const counts = asked.counts.length;
      await user.click(within(dialog).getByRole('button', { name: 'Save' }));

      await vi.waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      await vi.waitFor(() => expect(asked.codes.length).toBeGreaterThan(codes));
      await vi.waitFor(() =>
        expect(asked.counts.length).toBeGreaterThan(counts),
      );
    });

    // In several places: the row opens to its lots to choose one.
    it('opens to its lots to choose one, focus on the first lot’s Actions', async () => {
      const { user, menu } = await codeActions(['stock.move']);
      await user.click(within(menu).getByRole('menuitem', { name: 'Move' }));

      expect(await screen.findByText('Choose the lot.')).toBeVisible();
      await vi.waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'Actions for VITD-60, lot NN-2401, at Quarantine',
          }),
        ).toHaveFocus(),
      );
      expect(screen.getByText('NN-2410-07')).toBeVisible();
    });

    // One lot at one place: Move acts on it straight.
    it('moves its one lot at its one place straight', async () => {
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', () =>
          HttpResponse.json({ places: [PLACES[1]!] }),
        ),
      );
      const { user, menu } = await codeActions(['stock.move'], {
        ...CODE,
        places: 1,
        lots: 1,
      });
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', () =>
          HttpResponse.json({
            places: [{ ...PLACES[1]!, lots: [PLACES[1]!.lots[0]!] }],
          }),
        ),
      );
      await user.click(within(menu).getByRole('menuitem', { name: 'Move' }));

      expect(
        await screen.findByRole('dialog', { name: /Move to another location/ }),
      ).toBeVisible();
      expect(screen.queryByText('Choose the lot.')).not.toBeInTheDocument();
    });

    // A place's Actions: the code's Movements there alone.
    it('gives a place its Movements there', async () => {
      const user = userEvent.setup();
      answer();
      let asked: URLSearchParams | null = null;
      server.use(
        http.get('/api/v1/stock/movements', ({ request }) => {
          asked = new URL(request.url).searchParams;
          return HttpResponse.json({ entries: [], nextCursor: null });
        }),
      );
      renderAt('/inventory', ['stock.view', 'locations.view']);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: 'Actions for VITD-60 at Shelf A',
        }),
      );
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Movements',
        }),
      );

      expect(
        await screen.findByRole('dialog', { name: /at Shelf A/ }),
      ).toBeVisible();
      await vi.waitFor(() => expect(asked?.get('locationId')).toBe('loc-1'));
    });

    // Not tracked by lot, at the place chosen: its one pile, never "None
    // on hand" beside its stock (review 49).
    it('says nothing is on hand only when nothing is', async () => {
      answer([
        {
          ...CODE,
          lots: 0,
          places: 1,
          here: { lots: 0, onHand: '40.0000', expiresFirst: null },
        },
      ]);
      server.use(
        http.get('/api/v1/locations', () =>
          HttpResponse.json([
            {
              id: PLACE,
              type: 'shelf',
              name: 'Shelf A',
              code: null,
              parentId: null,
              isAvailable: true,
              isActive: true,
              address: null,
            },
          ]),
        ),
      );
      renderAt(`/inventory?locationId=${PLACE}`, [
        'stock.view',
        'locations.view',
      ]);

      expect(
        await screen.findByRole('button', { name: 'Actions for VITD-60' }),
      ).toBeVisible();
      expect(screen.queryByText('None on hand')).not.toBeInTheDocument();
    });
  });

  describe('a lot’s own actions', () => {
    /** The page, the code's row opened to its Shelf A lots, and a lot's ⋯. */
    async function lotActions(permissions: string[]) {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view', 'locations.view', ...permissions]);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: '2 lots: show the lots at Shelf A',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'Actions for VITD-60, lot NN-2410-07, at Shelf A',
        }),
      );
      return screen.findByRole('menu');
    }

    // A Viewer's first week asks them to look a lot up (ADR-079).
    it('gives someone who may only see stock the actions that read', async () => {
      const menu = await lotActions([]);

      expect(
        within(menu).getByRole('menuitem', { name: 'Trace lot' }),
      ).toBeInTheDocument();
      expect(
        within(menu).getByRole('menuitem', { name: 'Movements' }),
      ).toBeInTheDocument();
      for (const name of [...CHANGES, 'Correct the count']) {
        expect(
          within(menu).queryByRole('menuitem', { name }),
        ).not.toBeInTheDocument();
      }
    });

    it('adds what changes stock for someone who may move it, and correcting with both permissions', async () => {
      const menu = await lotActions(['stock.move', 'stock.adjust']);

      for (const name of [...CHANGES, 'Correct the count']) {
        expect(
          within(menu).getByRole('menuitem', { name }),
        ).toBeInTheDocument();
      }
    });
  });

  it('shows only why a first read failed, with Try again, never the empty list (#195)', async () => {
    let reads = 0;
    answer();
    server.use(
      http.get('/api/v1/stock/by-code', () => {
        reads += 1;
        return reads === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json({ entries: [], nextCursor: null });
      }),
    );
    renderAt('/inventory', ['stock.view']);

    const failed = await screen.findByRole('alert');
    expect(failed).toHaveTextContent('Internal server error');
    expect(screen.queryByText(/No stock yet/)).not.toBeInTheDocument();
    // The filters stay.
    expect(screen.getByRole('button', { name: /Low stock/ })).toBeVisible();

    await userEvent.click(
      within(failed).getByRole('button', { name: 'Try again' }),
    );
    expect(await screen.findByText(/No stock yet/)).toBeVisible();
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('keeps the rows when the next 50 cannot be read, with Try again (#544)', async () => {
    const user = userEvent.setup();
    let pages = 0;
    server.use(
      http.get('/api/v1/stock/by-code', ({ request }) => {
        if (!new URL(request.url).searchParams.has('before')) {
          return HttpResponse.json({ entries: [CODE], nextCursor: 'next' });
        }
        pages += 1;
        return pages === 1
          ? apiError(500, 'Internal server error')
          : HttpResponse.json({
              entries: [{ ...CODE, variantId: 'variant-2', sku: 'VITD-90' }],
              nextCursor: null,
            });
      }),
    );
    renderAt('/inventory', ['stock.view']);

    await user.click(
      await screen.findByRole('button', { name: 'Show 50 more' }),
    );
    expect(
      await screen.findByText('The next 50 could not be loaded.'),
    ).toBeVisible();
    expect(screen.getByText('VITD-60 · Product')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('VITD-90 · Product')).toBeVisible();
    expect(
      screen.queryByText('The next 50 could not be loaded.'),
    ).not.toBeInTheDocument();
  });

  describe('the Lot view', () => {
    // Home's Expiring soon opens it (ADR-091, amended).
    it('lists a row per lot with its own counts, Out not among its filters', async () => {
      const asked = answer();
      renderAt('/inventory?group=lot&expiring=1', ['stock.view']);

      expect(
        await screen.findByText('Soonest first, the expired on top.'),
      ).toBeVisible();
      await expect.poll(() => asked.lots.length).toBeGreaterThan(0);
      expect(asked.lots[0].get('expiringWithin')).toBe('90');
      expect(asked.codes).toHaveLength(0);
      await expect
        .poll(() => asked.lotCounts[0]?.get('expiringWithin'))
        .toBe('90');
      expect(
        await screen.findByRole('button', { name: /Low stock\s*2/ }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /^Out/ }),
      ).not.toBeInTheDocument();
    });

    it('says items that are out have no lots, with Group by Item', async () => {
      const user = userEvent.setup();
      const asked = answer();
      renderAt('/inventory?group=lot&out=1', ['stock.view']);

      expect(
        await screen.findByText('Items that are out have no lots.'),
      ).toBeVisible();
      expect(asked.lots).toHaveLength(0);

      await user.click(screen.getByRole('button', { name: 'Group by Item' }));
      await expect.poll(() => asked.codes.at(-1)?.get('out')).toBe('true');
    });
  });

  // Home's Receive stock opens the dialog, not only the list (#502).
  it('opens Receive stock from ?receive; closing keeps the list, Back returns Home', async () => {
    answer();
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
    expect(screen.getByText('VITD-60 · Product')).toBeVisible();
    expect(
      screen.getByRole('status', { name: 'address' }),
    ).toBeEmptyDOMElement();

    await userEvent.click(screen.getByRole('button', { name: 'Back' }));
    expect(await screen.findByRole('link', { name: 'Receive' })).toBeVisible();
  });

  // Trace a lot is a top-level page: Back returns here (#341).
  it('opens Trace a lot with Back to Inventory', async () => {
    answer();
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/lots" element={<LotSearchPage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );
    await screen.findByText('VITD-60 · Product');

    await userEvent.click(screen.getByRole('link', { name: 'Trace a lot' }));
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByText('VITD-60 · Product')).toBeVisible();
  });

  /**
   * Expiring soon lists the soonest first whenever it is on (ADR-091): the
   * panel's senior stopped at which lot expires first.
   */
  it('sorts Expiring soon by what expires first, soonest first, until a header is chosen', async () => {
    const user = userEvent.setup();
    const asked = answer();
    renderAt('/inventory?expiring=1', ['stock.view']);
    await screen.findByText('VITD-60 · Product');

    expect(Object.fromEntries(asked.codes[0])).toMatchObject({
      expiringWithin: '90',
      sort: 'expires',
      order: 'asc',
    });
    expect(
      screen.getByRole('columnheader', { name: 'Expires first' }),
    ).toHaveAttribute('aria-sort', 'ascending');

    await user.click(screen.getByRole('button', { name: 'Expires first' }));
    await expect.poll(() => asked.codes.at(-1)?.get('order')).toBe('desc');
  });

  it('sorts by a figure from its header, in the address', async () => {
    const user = userEvent.setup();
    const asked = answer();
    renderAt('/inventory', ['stock.view']);
    await screen.findByText('VITD-60 · Product');
    expect(asked.codes[0].has('sort')).toBe(false);

    await user.click(screen.getByRole('button', { name: 'On hand' }));
    await expect.poll(() => asked.codes.at(-1)?.get('sort')).toBe('onHand');
    expect(asked.codes.at(-1)?.get('order')).toBe('asc');
    expect(
      screen.getByRole('columnheader', { name: 'On hand' }),
    ).toHaveAttribute('aria-sort', 'ascending');
    // Free is no sort (35a): its header is words alone.
    expect(
      screen.queryByRole('button', { name: 'Free' }),
    ).not.toBeInTheDocument();
  });

  // A row's stock on Items (ADR-092): the item alone, its counts too,
  // named on a chip whose × removes it.
  it('lists one item alone when the address names it, named on a chip that removes it', async () => {
    const user = userEvent.setup();
    const asked = answer();
    let read = 0;
    server.use(
      http.get(`/api/v1/products/${PRODUCT}`, () => {
        read += 1;
        return HttpResponse.json({ displayName: 'Vitamine D' });
      }),
    );
    renderAt(`/inventory?productId=${PRODUCT}`, [
      'stock.view',
      'products.view',
    ]);

    // Named by its rows, in the reader's language, with no read of the
    // item's own (ADR-092's review, 58).
    const chip = await screen.findByRole('button', {
      name: 'Remove filter: Item: Vitamin D',
    });
    expect(read).toBe(0);
    expect(asked.codes[0].get('productId')).toBe(PRODUCT);
    await expect.poll(() => asked.counts[0]?.get('productId')).toBe(PRODUCT);

    await user.click(within(chip).getByTestId('CancelIcon'));
    await expect.poll(() => asked.codes.at(-1)?.has('productId')).toBe(false);
  });

  // It said only "Nothing here yet." (ADR-092's review, 90).
  it('says the item a row’s stock opened has no stock yet, by its name', async () => {
    answer([]);
    server.use(
      http.get(`/api/v1/products/${PRODUCT}`, () =>
        HttpResponse.json({ displayName: 'Vitamin D' }),
      ),
    );
    renderAt(`/inventory?productId=${PRODUCT}`, [
      'stock.view',
      'products.view',
    ]);

    expect(
      await screen.findByText('Vitamin D has no stock yet.'),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Remove filter: Item: Vitamin D' }),
    ).toBeVisible();
  });

  describe('the search', () => {
    it('follows the address while open, as Show all in the lookup changes it', async () => {
      const asked = answer();
      renderWithAuth(
        <MemoryRouter initialEntries={['/inventory']}>
          <Link to="/inventory?group=lot&search=NN-2410">Show all</Link>
          <InventoryPage />
        </MemoryRouter>,
        { permissions: ['stock.view'] },
      );
      await screen.findByText('VITD-60 · Product');

      await userEvent.click(screen.getByRole('link', { name: 'Show all' }));

      expect(
        screen.getByRole('searchbox', { name: 'Search items, codes or lots' }),
      ).toHaveValue('NN-2410');
      await expect.poll(() => asked.lots.at(-1)?.get('search')).toBe('NN-2410');
    });

    it('is one search on Stock and Reorder, either way', async () => {
      const user = userEvent.setup();
      const asked = answer();
      const points: (string | null)[] = [];
      server.use(
        http.get('/api/v1/stock/reorder-points', ({ request }) => {
          points.push(new URL(request.url).searchParams.get('search'));
          return HttpResponse.json({ entries: [], nextCursor: null });
        }),
        http.get('/api/v1/stock/reorder-points/counts', () =>
          HttpResponse.json({ all: 0, low: 0, out: 0 }),
        ),
      );
      renderAt('/inventory', ['stock.view']);
      await screen.findByText('VITD-60 · Product');

      await user.type(
        screen.getByRole('searchbox', { name: 'Search items, codes or lots' }),
        'vitd',
      );
      await expect.poll(() => asked.codes.at(-1)?.get('search')).toBe('vitd');
      await user.click(screen.getByRole('tab', { name: 'Reorder' }));

      const box = screen.getByRole('searchbox', { name: 'Search' });
      expect(box).toHaveValue('vitd');
      await expect.poll(() => points).toEqual(['vitd']);

      await user.clear(box);
      await user.type(box, 'd3');
      await expect.poll(() => points.at(-1)).toBe('d3');
      await user.click(screen.getByRole('tab', { name: 'Stock' }));

      expect(
        screen.getByRole('searchbox', { name: 'Search items, codes or lots' }),
      ).toHaveValue('d3');
      await expect.poll(() => asked.codes.at(-1)?.get('search')).toBe('d3');
    });
  });
});
