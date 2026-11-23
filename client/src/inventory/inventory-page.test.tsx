import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  Link,
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  Delivery,
  StockCodeRow,
  StockPile,
  StockPlace,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { OFFER_BACK } from '../lib/offer-back';
import { SEARCH_WAIT_MS } from '../lib/use-list-search';
import { apiError } from '../test/handlers';
import { heldRouter } from '../test/held-router';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';
import { LotSearchPage } from './lot-trace-page';

const PRODUCT = '00000000-0000-4000-8000-000000000001';
const PLACE = '00000000-0000-4000-8000-000000000009';

/** A purchase's line still to come for the item (ADR-093, v3). */
function delivery(variantId: string, sku: string): Delivery {
  return {
    orderId: 'order-12',
    number: 'PO-000012',
    partnerName: 'Harbour Supply',
    expectedAt: '2026-11-20',
    late: false,
    line: {
      id: 'line-12',
      variantId,
      sku,
      tracksLots: false,
      unitOfMeasure: 'each',
      quantityOrdered: '48.0000',
      quantityFulfilled: '0.0000',
      quantityOutstanding: '48.0000',
    },
  };
}

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
  allExpired: false,
  reorderPoint: '36.0000',
  status: 'low',
  needsCost: false,
  stocked: true,
  tracksLots: true,
  here: null,
};

/** One pile, a lot at a place, as a place's lots carry it. */
function pile(
  id: string,
  lot: string,
  expiresAt: string | null,
  at: string,
): StockPile {
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
    lotExpiry: expiresAt ? 'date' : 'none',
    lotIsAssigned: false,
    lotSupplierLot: null,
    quantity: '10.0000',
    emptiedOn: null,
    issuedToRun: null,
  };
}

const PLACES: StockPlace[] = [
  {
    locationId: 'loc-2',
    locationName: 'Quarantine',
    locationCode: null,
    locationPath: [],
    isAvailable: false,
    onHand: '12.0000',
    lots: [pile('3', 'NN-2401', '2026-01-01', 'Quarantine')],
  },
  {
    locationId: 'loc-1',
    locationName: 'Shelf A',
    locationCode: null,
    // Written as its path, the warehouse first (57a).
    locationPath: ['Main warehouse', 'Zone A'],
    isAvailable: true,
    onHand: '30.0000',
    lots: [
      pile('1', 'NN-2410-07', '2027-10-01', 'Shelf A'),
      pile('2', 'NN-2412-01', null, 'Shelf A'),
    ],
  },
];

const COUNTS = {
  low: 1,
  out: 0,
  expiring: 0,
  expired: 0,
  needsCost: 0,
  total: 1,
};

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
        detailsToAdd: 4,
        total: 3,
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

/** Where a way into Movements landed, whether it offered Back, and Back. */
function Landed() {
  const { pathname, search, state } = useLocation();
  const navigate = useNavigate();
  const back = (state as { offerBack?: boolean } | null)?.offerBack === true;
  return (
    <>
      <p>{`${pathname}${search}${back ? ' with Back' : ''}`}</p>
      <button type="button" onClick={() => void navigate(-1)}>
        Back
      </button>
    </>
  );
}

/** Stock, and Movements as a way in lands there (ADR-093, R11). */
function renderRouted(address: string, permissions: string[]) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/movements" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

const CHANGES = ['Move…', 'Ship out…', 'Send sample…', 'Edit lot details…'];

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
      // The quick filters with their counts (R3), each saying it counts
      // codes (108a).
      expect(
        await screen.findByRole('button', { name: 'Low stock · 1 code' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Out · 0 codes' }),
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
      // The place as its path, the warehouse first (57a).
      expect(
        await screen.findByText('Main warehouse › Zone A › Shelf A'),
      ).toBeVisible();
      expect(
        screen.getByText('Not usable: a place not available'),
      ).toBeVisible();

      await user.click(
        screen.getByRole('button', {
          name: '2 lots: show the lots at Main warehouse › Zone A › Shelf A',
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

    // Review 3, 115: a code not tracked by lot opens to why its places
    // are hidden, not a row of "—" for each.
    it('opens a code not tracked by lot to why its places are hidden, for a reader without places', async () => {
      const user = userEvent.setup();
      answer([{ ...CODE, lots: 0 }]);
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', () =>
          HttpResponse.json({
            places: PLACES.map((place) => ({
              ...place,
              locationName: null,
              locationPath: [],
              lots: [
                {
                  ...place.lots[0]!,
                  locationName: null,
                  lotId: null,
                  lotCode: null,
                  lotExpiresAt: null,
                },
              ],
            })),
          }),
        ),
      );
      renderAt('/inventory', ['stock.view']);

      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      expect(
        await screen.findByText(
          'Warehouses, zones and bins are hidden: your role can’t see them. An Owner or Admin can change that.',
        ),
      ).toBeVisible();
      expect(screen.queryByText('10 each')).not.toBeInTheDocument();
    });

    // A screen reader hears a menu button, not a plain one (#358).
    it('says a row’s Actions open a menu, its Movements for everyone and nothing that changes stock', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view']);

      const actions = await screen.findByRole('button', {
        name: 'Actions for Vitamin D (60ct)',
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
        await screen.findByRole('button', {
          name: 'Actions for Vitamin D (60ct)',
        }),
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
        'Move…',
        'Ship out…',
        'Send sample…',
        'Correct the count…',
        'Receive stock…',
        'Movements',
        'Change reorder point…',
      ]);
      // In three groups, and a line on what comes next (ADR-093 v3).
      expect(within(menu).getAllByRole('separator')).toHaveLength(3);
      expect(menu).toHaveAccessibleDescription(
        '2 lots in 2 places: you choose the lot next',
      );
    });

    // Nothing on hand: greyed with their reason, Correct the count kept to
    // correct an emptied lot, opened with the emptied ones (ADR-093 v3).
    it('greys what needs stock when nothing is on hand, and corrects an emptied lot', async () => {
      const asked: URLSearchParams[] = [];
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', ({ request }) => {
          asked.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            places: [
              {
                ...PLACES[1]!,
                onHand: '0.0000',
                lots: [
                  {
                    ...PLACES[1]!.lots[0]!,
                    quantity: '0.0000',
                    emptiedOn: '2026-11-14',
                  },
                ],
              },
            ],
          });
        }),
      );
      const empty = {
        ...CODE,
        onHand: '0.0000',
        usable: '0.0000',
        notUsable: '0.0000',
        places: 0,
        lots: 0,
      };
      const { user, menu } = await codeActions(
        ['stock.move', 'stock.adjust'],
        empty,
      );
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', ({ request }) => {
          asked.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            places: [
              {
                ...PLACES[1]!,
                onHand: '0.0000',
                lots: [
                  {
                    ...PLACES[1]!.lots[0]!,
                    quantity: '0.0000',
                    emptiedOn: '2026-11-14',
                  },
                ],
              },
            ],
          });
        }),
      );

      const move = within(menu).getByRole('menuitem', { name: /^Move…/ });
      expect(move).toHaveAttribute('aria-disabled', 'true');
      expect(move).toHaveTextContent('Nothing on hand to move');
      await user.click(
        within(menu).getByRole('menuitem', { name: 'Correct the count…' }),
      );

      expect(
        await screen.findByText('Choose the lot to correct'),
      ).toBeVisible();
      expect(asked.at(-1)?.get('includeEmpty')).toBe('true');
      expect(screen.getByText('Emptied Nov 14, 2026')).toBeVisible();
    });

    it('greys Correct the count for an item never stocked here', async () => {
      const { menu } = await codeActions(['stock.move', 'stock.adjust'], {
        ...CODE,
        onHand: '0.0000',
        places: 0,
        lots: 0,
        stocked: false,
      });

      const correct = within(menu).getByRole('menuitem', {
        name: /^Correct the count…/,
      });
      expect(correct).toHaveAttribute('aria-disabled', 'true');
      expect(correct).toHaveTextContent('Never stocked here: receive it first');
    });

    it('receives stock with the item filled in', async () => {
      const { user, menu } = await codeActions(['stock.move']);
      await user.click(
        within(menu).getByRole('menuitem', { name: 'Receive stock…' }),
      );

      expect(
        await screen.findByRole('dialog', { name: 'Receive stock' }),
      ).toBeVisible();
    });

    // ADR-093, v3: ordered stock is received on its order, never beside it.
    it('asks which delivery it is, its one order chosen, and receives on that order’s line over Stock', async () => {
      server.use(
        http.get('/api/v1/orders/deliveries', () =>
          HttpResponse.json([delivery('variant-1', 'VITD-60')]),
        ),
      );
      const { user, menu } = await codeActions([
        'stock.move',
        'orders.view',
        'orders.receive',
      ]);
      await user.click(
        within(menu).getByRole('menuitem', { name: 'Receive stock…' }),
      );

      const free = await screen.findByRole('dialog', { name: 'Receive stock' });
      expect(
        await within(free).findByRole('radio', { name: /PO-000012/ }),
      ).toBeChecked();
      await user.click(within(free).getByRole('button', { name: 'Continue' }));

      const onOrder = await screen.findByRole('dialog', {
        name: 'Receive VITD-60 on PO-000012',
      });
      expect(onOrder).toHaveTextContent(
        'From Harbour Supply: 48 each still to come',
      );
      expect(
        within(onOrder).getByRole('textbox', { name: 'Quantity' }),
      ).toHaveValue('48.0000');
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
        await screen.findByRole('button', {
          name: 'Actions for Vitamin D (60ct)',
        }),
      );
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Change reorder point…',
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
      await user.click(within(menu).getByRole('menuitem', { name: 'Move…' }));

      expect(await screen.findByText('Choose the lot to move')).toBeVisible();
      await vi.waitFor(() =>
        expect(
          screen.getByRole('button', {
            name: 'Actions for lot NN-2401 at Quarantine',
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
      await user.click(within(menu).getByRole('menuitem', { name: 'Move…' }));

      expect(
        await screen.findByRole('dialog', { name: /Move to another location/ }),
      ).toBeVisible();
      expect(
        screen.queryByText('Choose the lot to move'),
      ).not.toBeInTheDocument();
    });

    // A place's Movements link: Movements of the code there alone, by
    // the address's ids (R11, 95a), offering Back.
    it('gives a place its Movements there', async () => {
      const user = userEvent.setup();
      answer();
      renderRouted('/inventory', ['stock.view', 'locations.view']);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      // A plain link, not a menu of one (ADR-093 v3).
      await user.click(
        await screen.findByRole('link', {
          name: 'Movements of Vitamin D (60ct) at Main warehouse › Zone A › Shelf A',
        }),
      );

      expect(
        await screen.findByText(
          '/movements?variantId=variant-1&locationId=loc-1 with Back',
        ),
      ).toBeVisible();
    });

    // An item's Actions › Movements: the code's (R11).
    it('gives an item its Movements', async () => {
      const user = userEvent.setup();
      answer();
      renderRouted('/inventory', ['stock.view', 'locations.view']);
      await user.click(
        await screen.findByRole('button', {
          name: 'Actions for Vitamin D (60ct)',
        }),
      );
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Movements',
        }),
      );

      expect(
        await screen.findByText('/movements?variantId=variant-1 with Back'),
      ).toBeVisible();
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
        await screen.findByRole('button', {
          name: 'Actions for Vitamin D (60ct)',
        }),
      ).toBeVisible();
      expect(screen.queryByText('None on hand')).not.toBeInTheDocument();
    });

    // ADR-094, T2: Stock's door to Start tracking lots, the code's row
    // alone, never a place's or a lot's: tracking is the code's.
    describe('Start tracking lots…', () => {
      const UNTRACKED: StockCodeRow = { ...CODE, tracksLots: false };
      const BOTH = ['stock.move', 'products.update', 'stock.adjust'];

      it('comes last, after a divider, for a code not tracked, to whoever may change items and correct counts', async () => {
        const { menu } = await codeActions(
          [...BOTH, 'stock.reorder'],
          UNTRACKED,
        );

        expect(
          within(menu)
            .getAllByRole('menuitem')
            .map((item) => item.textContent),
        ).toEqual([
          'Move…',
          'Ship out…',
          'Send sample…',
          'Correct the count…',
          'Receive stock…',
          'Movements',
          'Change reorder point…',
          'Start tracking lots…',
        ]);
        expect(within(menu).getAllByRole('separator')).toHaveLength(4);
      });

      it.each<[string, StockCodeRow, string[]]>([
        ['a code tracked', CODE, BOTH],
        ['equipment', { ...UNTRACKED, type: 'equipment' }, BOTH],
        [
          'a reader who may not change items',
          UNTRACKED,
          ['stock.move', 'stock.adjust'],
        ],
        [
          'a reader who may not correct counts',
          UNTRACKED,
          ['stock.move', 'products.update'],
        ],
      ])('is not offered for %s', async (_, row, permissions) => {
        const { menu } = await codeActions(permissions, row);

        expect(
          within(menu).getByRole('menuitem', { name: 'Movements' }),
        ).toBeVisible();
        expect(
          within(menu).queryByRole('menuitem', {
            name: 'Start tracking lots…',
          }),
        ).not.toBeInTheDocument();
      });

      it('opens the question for the row’s code; started, the message names the lot, and the row opens at it, at each place', async () => {
        const path = `/api/v1/products/${PRODUCT}/variants/variant-1/lot-tracking`;
        const sent: unknown[] = [];
        answer([UNTRACKED]);
        server.use(
          http.get(path, () =>
            HttpResponse.json({
              variantId: 'variant-1',
              sku: 'VITD-60',
              onHand: '42.0000',
              places: PLACES.map((place) => ({
                locationId: place.locationId,
                locationName: place.locationName,
                locationCode: null,
                locationPath: place.locationPath,
                quantity: place.onHand,
              })),
              runCount: 0,
              runs: [],
            }),
          ),
          http.post(path, async ({ request }) => {
            sent.push(await request.json());
            return HttpResponse.json(
              { lot: { id: 'lot-9', code: 'L-2026-11-23-1' } },
              { status: 201 },
            );
          }),
        );
        function Address() {
          const { search } = useLocation();
          return <output aria-label="address">{search}</output>;
        }
        renderWithAuth(
          <ToastProvider>
            <MemoryRouter initialEntries={['/inventory']}>
              <InventoryPage />
              <Address />
            </MemoryRouter>
          </ToastProvider>,
          { permissions: ['stock.view', 'locations.view', ...BOTH] },
        );
        const user = userEvent.setup();
        await user.click(
          await screen.findByRole('button', {
            name: 'Actions for Vitamin D (60ct)',
          }),
        );
        await user.click(
          await screen.findByRole('menuitem', {
            name: 'Start tracking lots…',
          }),
        );

        const dialog = await screen.findByRole('dialog', {
          name: 'Start tracking lots for VITD-60',
        });
        expect(
          await within(dialog).findByText(/^42 each on hand goes into one lot/),
        ).toBeVisible();
        await user.click(
          within(dialog).getByRole('button', { name: 'Start tracking lots' }),
        );

        // The item's page's message, its codes kept whole.
        expect(
          await screen.findByText(/^Lot tracking started for/),
        ).toHaveTextContent(
          'Lot tracking started for VITD-60. Its stock on hand is in lot L-2026-11-23-1.',
        );
        expect(dialog).not.toBeInTheDocument();
        expect(sent).toEqual([{ expiry: 'unknown' }]);
        await vi.waitFor(() =>
          expect(
            screen.getByRole('status', { name: 'address' }),
          ).toHaveTextContent(
            '?open=variant-1%2Cvariant-1.loc-2%2Cvariant-1.loc-1',
          ),
        );
      });
    });
  });

  // Found stock (ADR-093, R26, 84a): a code's opened places end with
  // Count it in…, Correct the count with a place and Which lot, neither
  // lot chosen; Escape returns focus to it.
  describe('stock found where it has never been', () => {
    it('ends a code’s opened places with Count it in…, and Escape returns to it', async () => {
      const user = userEvent.setup();
      answer();
      server.use(http.get('/api/v1/stock/lots', () => HttpResponse.json([])));
      renderAt('/inventory', [
        'stock.view',
        'locations.view',
        'stock.move',
        'stock.adjust',
      ]);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );

      expect(
        await screen.findByText('Found some where it has never been?'),
      ).toBeVisible();
      // Its name carries the code it counts in, read apart from the
      // code's row (105a); it shows "Count it in…".
      const countIn = screen.getByRole('button', {
        name: 'Count it in VITD-60…',
      });
      expect(countIn).toHaveTextContent(/^Count it in…$/);
      await user.click(countIn);

      const dialog = await screen.findByRole('dialog', {
        name: 'Correct the count',
      });
      expect(
        within(dialog).getByRole('combobox', { name: /^Location/ }),
      ).toBeVisible();
      for (const radio of within(
        within(dialog).getByRole('radiogroup', { name: /^Which lot/ }),
      ).getAllByRole('radio')) {
        expect(radio).not.toBeChecked();
      }

      await user.keyboard('{Escape}');
      expect(dialog).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', { name: 'Count it in VITD-60…' }),
      ).toHaveFocus();
    });

    // ADR-094: the code's own tracking, never told by its lot rows: a
    // code not tracked whose rows the page reads with lots still counts
    // in with no lot, as one started with nothing on hand asks for one.
    it('counts in by the code’s own lot tracking, not by whether a place shows a lot', async () => {
      const user = userEvent.setup();
      answer([{ ...CODE, tracksLots: false }]);
      renderAt('/inventory', [
        'stock.view',
        'locations.view',
        'stock.move',
        'stock.adjust',
      ]);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', { name: 'Count it in VITD-60…' }),
      );

      const dialog = await screen.findByRole('dialog', {
        name: 'Correct the count',
      });
      expect(
        within(dialog).queryByRole('radiogroup', { name: /^Which lot/ }),
      ).not.toBeInTheDocument();
    });

    it('offers it only to whoever may correct counts', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory', ['stock.view', 'locations.view', 'stock.move']);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );

      expect(
        await screen.findByRole('button', {
          name: '2 lots: show the lots at Main warehouse › Zone A › Shelf A',
        }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /^Count it in/ }),
      ).not.toBeInTheDocument();
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
          name: '2 lots: show the lots at Main warehouse › Zone A › Shelf A',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      );
      return screen.findByRole('menu');
    }

    // A lot's Actions › Movements: the lot's (R11, R24); Back finds the
    // code's row open and its place's lots with it, as `?open=` keeps
    // them, focus on the code's name.
    it('gives a lot its Movements, and Back finds its place’s lots open', async () => {
      const user = userEvent.setup();
      answer();
      renderRouted('/inventory', ['stock.view', 'locations.view']);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: '2 lots: show the lots at Main warehouse › Zone A › Shelf A',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      );
      await user.click(
        within(await screen.findByRole('menu')).getByRole('menuitem', {
          name: 'Movements',
        }),
      );
      expect(
        await screen.findByText(
          '/movements?variantId=variant-1&lotId=lot-1 with Back',
        ),
      ).toBeVisible();

      await user.click(screen.getByRole('button', { name: 'Back' }));
      expect(
        await screen.findByRole('button', {
          name: '2 lots: hide the lots at Main warehouse › Zone A › Shelf A',
        }),
      ).toHaveAttribute('aria-expanded', 'true');
      expect(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      ).toBeVisible();
      expect(screen.getByRole('link', { name: /^Vitamin D/ })).toHaveFocus();
    });

    // A Viewer's first week asks them to look a lot up (ADR-079).
    it('gives someone who may only see stock the actions that read', async () => {
      const menu = await lotActions([]);

      expect(
        within(menu).getByRole('menuitem', { name: 'Trace lot' }),
      ).toBeInTheDocument();
      expect(
        within(menu).getByRole('menuitem', { name: 'Movements' }),
      ).toBeInTheDocument();
      for (const name of [...CHANGES, 'Correct the count…']) {
        expect(
          within(menu).queryByRole('menuitem', { name }),
        ).not.toBeInTheDocument();
      }
    });

    // An emptied lot, shown with Include empty: nothing to move, ship or
    // send, its count still to correct (ADR-093 v3).
    it('greys what an emptied lot cannot do, saying it holds nothing', async () => {
      const user = userEvent.setup();
      answer();
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', () =>
          HttpResponse.json({
            places: [
              {
                ...PLACES[1]!,
                lots: [
                  {
                    ...PLACES[1]!.lots[0]!,
                    quantity: '0.0000',
                    emptiedOn: '2026-11-14',
                  },
                ],
              },
            ],
          }),
        ),
      );
      renderAt('/inventory?includeEmpty=1', [
        'stock.view',
        'locations.view',
        'stock.move',
        'stock.adjust',
      ]);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: '1 lot: show the lots at Main warehouse › Zone A › Shelf A',
        }),
      );
      expect(screen.getByText('Emptied Nov 14, 2026')).toBeVisible();
      await user.click(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      );
      const menu = await screen.findByRole('menu');

      for (const name of [/^Move…/, /^Ship out…/, /^Send sample…/]) {
        const choice = within(menu).getByRole('menuitem', { name });
        expect(choice).toHaveAttribute('aria-disabled', 'true');
        expect(choice).toHaveTextContent('Nothing in this lot');
      }
      expect(
        within(menu).getByRole('menuitem', { name: 'Correct the count…' }),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('adds what changes stock for someone who may move it, and correcting with both permissions', async () => {
      const menu = await lotActions(['stock.move', 'stock.adjust']);

      // In three groups: what changes it, the lot itself, its Movements
      // (ADR-093 v3).
      expect(
        within(menu)
          .getAllByRole('menuitem')
          .map((item) => item.textContent),
      ).toEqual([
        'Move…',
        'Ship out…',
        'Send sample…',
        'Correct the count…',
        'Edit lot details…',
        'Move to another lot…',
        'Trace lot',
        'Movements',
      ]);
      expect(within(menu).getAllByRole('separator')).toHaveLength(2);
    });

    // ADR-094, R20: a correction of which lot the stock is in, for
    // whoever may correct counts.
    // A lot issued here to a run still open: its close takes it, so it
    // stays in its lot until the run is closed or cancelled (review 73).
    it('greys Move to another lot… for a lot issued to a run still open, naming the run', async () => {
      const user = userEvent.setup();
      answer();
      server.use(
        http.get('/api/v1/stock/by-code/variant-1/places', () =>
          HttpResponse.json({
            places: [
              {
                ...PLACES[1]!,
                lots: [
                  {
                    ...PLACES[1]!.lots[0]!,
                    issuedToRun: {
                      id: 'run-1',
                      reference: null,
                      quantityPlanned: '1000.0000',
                    },
                  },
                ],
              },
            ],
          }),
        ),
      );
      renderAt('/inventory', [
        'stock.view',
        'locations.view',
        'stock.move',
        'stock.adjust',
      ]);
      await user.click(
        await screen.findByRole('button', {
          name: '2 places: show where Vitamin D (60ct) is',
        }),
      );
      await user.click(
        await screen.findByRole('button', {
          name: '1 lot: show the lots at Main warehouse › Zone A › Shelf A',
        }),
      );
      await user.click(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      );
      const menu = await screen.findByRole('menu');

      const choice = within(menu).getByRole('menuitem', {
        name: /^Move to another lot…/,
      });
      expect(choice).toHaveAttribute('aria-disabled', 'true');
      expect(choice).toHaveTextContent(
        'Issued to run 1,000 planned, still open',
      );
      // The rest of what it holds still moves, ships and is corrected.
      expect(
        within(menu).getByRole('menuitem', { name: /^Move…/ }),
      ).not.toHaveAttribute('aria-disabled');
    });

    it('offers no Move to another lot… to whoever may only move stock', async () => {
      const menu = await lotActions(['stock.move']);
      expect(
        within(menu).queryByRole('menuitem', {
          name: 'Move to another lot…',
        }),
      ).not.toBeInTheDocument();
    });

    it('opens Move to another lot… on the lot, Escape back on its Actions', async () => {
      const user = userEvent.setup();
      server.use(http.get('/api/v1/stock/lots', () => HttpResponse.json([])));
      const menu = await lotActions(['stock.move', 'stock.adjust']);
      await user.click(
        within(menu).getByRole('menuitem', { name: 'Move to another lot…' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Move to another lot',
      });
      expect(dialog).toHaveTextContent(
        'VITD-60 · lot NN-2410-07 at Shelf A — 10 each on hand',
      );
      await user.keyboard('{Escape}');
      expect(dialog).not.toBeInTheDocument();
      expect(
        screen.getByRole('button', {
          name: 'Actions for lot NN-2410-07 at Shelf A',
        }),
      ).toHaveFocus();
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

  // Bob's third message (7): the Lot view's headers sort it, Expires its
  // own order, marked, and its line said only while it is the order.
  it('sorts the Lot view from its headers, each way, Expires marked as its own order', async () => {
    const user = userEvent.setup();
    answer();
    const asked = { lots: [] as URLSearchParams[] };
    server.use(
      http.get('/api/v1/stock/by-lot', ({ request }) => {
        asked.lots.push(new URL(request.url).searchParams);
        return HttpResponse.json({
          entries: [
            {
              ...pile('1', 'NN-2410-07', '2027-10-01', 'Shelf A'),
              productId: PRODUCT,
              type: 'good',
              coverFileId: null,
              locationPath: [],
              isAvailable: true,
              places: 1,
            },
          ],
          nextCursor: null,
        });
      }),
    );
    renderAt('/inventory?group=lot', ['stock.view', 'locations.view']);
    await screen.findByRole('link', { name: 'NN-2410-07' });

    const expires = await screen.findByRole('columnheader', {
      name: /^Expires/,
    });
    expect(expires).toHaveAttribute('aria-sort', 'ascending');
    expect(
      screen.getByText('Soonest first, the expired on top.'),
    ).toBeVisible();
    expect(asked.lots[0]?.has('sort')).toBe(false);

    for (const [header, key] of [
      ['Item', 'item'],
      ['Location', 'location'],
      ['Quantity', 'quantity'],
    ] as const) {
      // Its header's own button: Group by has an Item too.
      const column = () =>
        screen.getByRole('columnheader', { name: new RegExp(`^${header}`) });
      await user.click(within(column()).getByRole('button'));
      await expect.poll(() => asked.lots.at(-1)?.get('sort')).toBe(key);
      expect(asked.lots.at(-1)?.get('order')).toBe('asc');
      expect(column()).toHaveAttribute('aria-sort', 'ascending');
      await user.click(within(column()).getByRole('button'));
      await expect.poll(() => asked.lots.at(-1)?.get('order')).toBe('desc');
    }
    expect(
      screen.queryByText('Soonest first, the expired on top.'),
    ).not.toBeInTheDocument();
  });

  // Each Lot view row has the lot's Actions, as a lot's row under its
  // place does (Bob's third message, 7).
  it('gives each Lot view row the lot’s own Actions', async () => {
    const user = userEvent.setup();
    answer();
    server.use(
      http.get('/api/v1/stock/by-lot', () =>
        HttpResponse.json({
          entries: [
            {
              ...pile('1', 'NN-2410-07', '2027-10-01', 'Shelf A'),
              productId: PRODUCT,
              type: 'good',
              coverFileId: null,
              locationPath: [],
              isAvailable: true,
              places: 1,
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderAt('/inventory?group=lot', [
      'stock.view',
      'locations.view',
      'stock.move',
      'stock.adjust',
    ]);

    await user.click(
      await screen.findByRole('button', {
        name: 'Actions for lot NN-2410-07 at Shelf A',
      }),
    );
    const menu = await screen.findByRole('menu');
    for (const name of [
      'Move…',
      'Ship out…',
      'Send sample…',
      'Correct the count…',
      'Edit lot details…',
      'Trace lot',
      'Movements',
    ]) {
      expect(within(menu).getByRole('menuitem', { name })).toBeInTheDocument();
    }
  });

  // A lot's Movements carries no days, from either view, so it reads the
  // lot's whole life, the receipt it starts from too (132b).
  it('opens a Lot view row’s Movements on the lot’s whole life, no days', async () => {
    const user = userEvent.setup();
    answer();
    server.use(
      http.get('/api/v1/stock/by-lot', () =>
        HttpResponse.json({
          entries: [
            {
              ...pile('1', 'NN-2410-07', '2027-10-01', 'Shelf A'),
              productId: PRODUCT,
              type: 'good',
              coverFileId: null,
              locationPath: [],
              isAvailable: true,
              places: 1,
            },
          ],
          nextCursor: null,
        }),
      ),
    );
    renderRouted('/inventory?group=lot', ['stock.view', 'locations.view']);

    await user.click(
      await screen.findByRole('button', {
        name: 'Actions for lot NN-2410-07 at Shelf A',
      }),
    );
    await user.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Movements',
      }),
    );
    expect(
      await screen.findByText(
        '/movements?variantId=variant-1&lotId=lot-1 with Back',
      ),
    ).toBeVisible();
    expect(screen.queryByText(/from=|until=/)).not.toBeInTheDocument();
  });

  // Bob's third message (6): the quick filters on a row of their own,
  // above the search, Type, Category, Location and Group by.
  it('puts the quick filters on a row of their own above the search', async () => {
    answer();
    renderAt('/inventory', ['stock.view']);

    const low = await screen.findByRole('button', { name: /^Low stock/ });
    const search = screen.getByRole('searchbox', {
      name: 'Search items, codes or lots',
    });
    expect(
      low.compareDocumentPosition(search) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(low.parentElement).not.toContainElement(search);
  });

  describe('on a phone', () => {
    beforeEach(() => {
      vi.stubGlobal('matchMedia', (query: string) => {
        const min = /min-width:\s*([\d.]+)px/.exec(query);
        const max = /max-width:\s*([\d.]+)px/.exec(query);
        return {
          matches:
            (!min || 390 >= Number(min[1])) && (!max || 390 <= Number(max[1])),
          media: query,
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
        };
      });
      return () => vi.unstubAllGlobals();
    });

    // At a phone's width the quick filters stay in the Filters sheet, the
    // button counting those on.
    it('keeps the quick filters in the Filters sheet, counted on its button', async () => {
      const user = userEvent.setup();
      answer();
      renderAt('/inventory?low=1', ['stock.view']);

      const filters = await screen.findByRole('button', {
        name: /^Filters/,
      });
      expect(filters).toHaveTextContent('1');
      expect(
        screen.queryByRole('button', { name: /^Low stock/ }),
      ).not.toBeInTheDocument();

      await user.click(filters);
      const sheet = await screen.findByRole('dialog', {
        name: 'Filters and sort',
      });
      expect(
        within(sheet).getByRole('button', {
          name: /^Low stock/,
          pressed: true,
        }),
      ).toBeVisible();
    });

    // #612: a card has no Held column, so it says why Free is less than
    // On hand: what is not usable and why, and what is held.
    it('says on a card why Free is less than On hand', async () => {
      answer();
      renderAt('/inventory', ['stock.view']);

      const why = await screen.findByText(
        '12 not usable: expired and at a place not available',
      );
      expect(why).toBeVisible();
      const card = why.closest('li') as HTMLElement;
      expect(within(card).getByText('30 held')).toBeVisible();
    });
  });

  // Bob's third message (5): as Items says it, the rows read of every row
  // the filters match, from the counts read with those filters.
  it('says how many codes it shows of those its filters match, beside Show 50 more', async () => {
    const counted: URLSearchParams[] = [];
    server.use(
      http.get('/api/v1/stock/by-code', () =>
        HttpResponse.json({ entries: [CODE], nextCursor: 'next' }),
      ),
      http.get('/api/v1/stock/by-code/counts', ({ request }) => {
        counted.push(new URL(request.url).searchParams);
        return HttpResponse.json({ ...COUNTS, total: 128 });
      }),
    );
    renderAt('/inventory?low=1', ['stock.view']);

    expect(await screen.findByText('Showing 1 of 128 codes')).toBeVisible();
    expect(counted.at(-1)?.get('low')).toBe('true');
  });

  // #611: a code whose every unit has expired says so, where "—" read as
  // nothing to expire; one with nothing to expire keeps "—".
  it('says all expired where every unit on hand has, and — where nothing expires', async () => {
    answer([
      {
        ...CODE,
        onHand: '12.0000',
        usable: '0.0000',
        notUsable: '12.0000',
        expired: '12.0000',
        unavailable: '0.0000',
        held: '0.0000',
        short: '0.0000',
        expiresFirst: null,
        allExpired: true,
      },
      {
        ...CODE,
        variantId: 'variant-2',
        sku: 'VITD-120',
        variantName: '120ct',
        expired: '0.0000',
        notUsable: '12.0000',
        expiresFirst: null,
      },
    ]);
    renderAt('/inventory', ['stock.view']);

    const expired = await screen.findByText('VITD-60 · Product');
    const never = await screen.findByText('VITD-120 · Product');
    expect(
      within(expired.closest('tr') as HTMLElement).getByText('all expired'),
    ).toBeVisible();
    expect(
      within(never.closest('tr') as HTMLElement).queryByText('all expired'),
    ).not.toBeInTheDocument();
  });

  // Review 13: every unit expired though some sit at a place not
  // available, Vitamin C's 24 on the shelf and 48 in quarantine, where
  // expired counts the shelf's 24 alone; the server says it.
  it('says all expired where an expired lot sits at a place not available too', async () => {
    answer([
      {
        ...CODE,
        onHand: '72.0000',
        usable: '0.0000',
        notUsable: '72.0000',
        expired: '24.0000',
        unavailable: '48.0000',
        held: '0.0000',
        short: '0.0000',
        expiresFirst: null,
        allExpired: true,
      },
    ]);
    renderAt('/inventory', ['stock.view']);

    const row = (await screen.findByText('VITD-60 · Product')).closest('tr');
    expect(within(row as HTMLElement).getByText('all expired')).toBeVisible();
  });

  // #638 (P1a): the count always, so a person can tell the list is whole.
  it('says how many codes it shows once every one is shown', async () => {
    answer();
    renderAt('/inventory', ['stock.view']);

    expect(await screen.findByText('1 code')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Show 50 more' }),
    ).not.toBeInTheDocument();
  });

  // #473's last line (P2a): Back after Show 50 more reads the pages shown
  // again, and focus is on the name of the code left from.
  it('finds the codes shown and the one left from on Back after Show 50 more', async () => {
    const user = userEvent.setup();
    answer();
    const later = {
      ...CODE,
      variantId: 'variant-2',
      sku: 'ZINC-60',
      productName: 'Zinc',
      variantName: null,
    };
    server.use(
      http.get('/api/v1/stock/by-code', ({ request }) =>
        new URL(request.url).searchParams.has('before')
          ? HttpResponse.json({ entries: [later], nextCursor: null })
          : HttpResponse.json({ entries: [CODE], nextCursor: 'next' }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory']}>
        <Routes>
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/items/:id" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );
    await user.click(
      await screen.findByRole('button', { name: 'Show 50 more' }),
    );
    await user.click(await screen.findByRole('link', { name: /^Zinc/ }));

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    const left = await screen.findByRole('link', { name: /^Zinc/ });
    expect(screen.getByRole('link', { name: /^Vitamin D/ })).toBeVisible();
    await waitFor(() => expect(left).toHaveFocus());
  });

  it('says how many lots the Lot view shows of those its filters match', async () => {
    server.use(
      http.get('/api/v1/stock/by-lot', () =>
        HttpResponse.json({
          entries: [
            {
              ...pile('3', 'NN-2401', '2027-01-01', 'Shelf A'),
              productId: PRODUCT,
              type: 'good',
              coverFileId: null,
              locationPath: [],
              isAvailable: true,
              places: 1,
            },
          ],
          nextCursor: 'next',
        }),
      ),
      http.get('/api/v1/stock/by-lot/counts', () =>
        HttpResponse.json({
          low: 0,
          expiring: 0,
          expired: 0,
          needsCost: 0,
          total: 312,
        }),
      ),
    );
    renderAt('/inventory?group=lot', ['stock.view']);

    expect(await screen.findByText('Showing 1 of 312 lots')).toBeVisible();
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
      // Each saying it counts lots (108a).
      expect(
        await screen.findByRole('button', { name: 'Low stock · 2 lots' }),
      ).toBeVisible();
      expect(
        screen.getByRole('button', { name: 'Expiring soon · 1 lot' }),
      ).toBeVisible();
      expect(
        screen.queryByRole('button', { name: /^Out/ }),
      ).not.toBeInTheDocument();
    });

    // A lot at a place not available says so to a reader who may not see
    // places too, never where (A6; review 61).
    it('says a lot is not usable to a reader without places', async () => {
      answer();
      server.use(
        http.get('/api/v1/stock/by-lot', () =>
          HttpResponse.json({
            entries: [
              {
                ...pile('3', 'NN-2401', '2026-01-01', 'Quarantine'),
                locationName: null,
                productId: PRODUCT,
                type: 'good',
                coverFileId: null,
                locationPath: [],
                isAvailable: false,
                places: 1,
              },
            ],
            nextCursor: null,
          }),
        ),
      );
      renderAt('/inventory?group=lot', ['stock.view']);

      expect(
        await screen.findByText('Not usable: a place not available'),
      ).toBeVisible();
      expect(screen.queryByText('Quarantine')).not.toBeInTheDocument();
      // Its code with the type as a word, as Stock's rows (review 63).
      expect(screen.getByText('VITD-60 · Product')).toBeVisible();
    });

    // ADR-094, R5, R9: a lot not yet finished is marked where it shows,
    // and Details to add lists them all, in the address.
    it('marks a lot whose expiry or supplier’s lot is still to add, and lists them by Details to add, the Lot view’s alone', async () => {
      const user = userEvent.setup();
      const asked = answer();
      const row = (over: Partial<StockPile>) => ({
        ...pile('1', 'L-2026-11-20-1', null, 'Shelf A'),
        productId: PRODUCT,
        type: 'good',
        coverFileId: null,
        locationPath: [],
        isAvailable: true,
        places: 1,
        ...over,
      });
      server.use(
        http.get('/api/v1/stock/by-lot', ({ request }) => {
          asked.lots.push(new URL(request.url).searchParams);
          return HttpResponse.json({
            entries: [
              row({ lotExpiry: 'unknown', lotIsAssigned: true }),
              row({
                id: '2',
                lotId: 'lot-2',
                lotCode: 'L-2026-11-20-2',
                lotIsAssigned: true,
                lotSupplierLot: 'SUP-88',
              }),
            ],
            nextCursor: null,
          });
        }),
      );
      renderAt('/inventory?group=lot', ['stock.view', 'locations.view']);

      expect(await screen.findByText('Expiry to add')).toBeVisible();
      expect(screen.getByText('Supplier’s lot to add')).toBeVisible();
      expect(screen.getByText('Supplier’s lot SUP-88')).toBeVisible();

      await user.click(
        await screen.findByRole('button', { name: 'Details to add · 4 lots' }),
      );
      await expect
        .poll(() => asked.lots.at(-1)?.get('detailsToAdd'))
        .toBe('true');
      expect(
        screen.getByRole('button', { name: 'Details to add · 4 lots' }),
      ).toHaveAttribute('aria-pressed', 'true');

      // A row per code has none.
      await user.click(
        within(screen.getByRole('group', { name: 'Group by' })).getByRole(
          'button',
          { name: 'Item' },
        ),
      );
      await expect.poll(() => asked.codes.length).toBeGreaterThan(0);
      expect(asked.codes.at(-1)?.get('detailsToAdd')).toBeNull();
      expect(
        screen.queryByRole('button', { name: /^Details to add/ }),
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

  // ADR-093, v3: the page's own Receive stock asks too, once an item
  // still to come is chosen.
  it('asks which delivery it is from the page’s Receive stock, once such an item is chosen', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/orders/deliveries', ({ request }) =>
        HttpResponse.json(
          new URL(request.url).searchParams.get('variantId') === 'variant-plain'
            ? [delivery('variant-plain', 'PLAIN-1')]
            : [],
        ),
      ),
    );
    answer();
    renderAt('/inventory', [
      'stock.view',
      'stock.move',
      'locations.view',
      'orders.view',
      'orders.receive',
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Receive stock' }),
    );
    const free = await screen.findByRole('dialog', { name: 'Receive stock' });
    await user.click(within(free).getByRole('combobox', { name: 'Item' }));
    await user.click(await screen.findByRole('option', { name: /PLAIN-1/ }));

    const question = await within(free).findByRole('radiogroup', {
      name: 'Which delivery is this?',
    });
    // Nothing chosen for the reader from the page.
    expect(
      within(question).getByRole('radio', { name: /PO-000012/ }),
    ).not.toBeChecked();
    expect(
      within(question).getByRole('radio', { name: 'Not on an order' }),
    ).toBeInTheDocument();
  });

  // Found in a count, counted in: Receive stock opens empty the next time,
  // as it does after a receipt (review 68).
  it('opens Receive stock empty again after Found in a count is counted in', async () => {
    const user = userEvent.setup();
    answer();
    renderAt('/inventory', [
      'stock.view',
      'stock.move',
      'stock.adjust',
      'locations.view',
    ]);

    await user.click(
      await screen.findByRole('button', { name: 'Receive stock' }),
    );
    const free = await screen.findByRole('dialog', { name: 'Receive stock' });
    await user.click(within(free).getByRole('combobox', { name: 'Item' }));
    await user.click(await screen.findByRole('option', { name: /PLAIN-1/ }));
    await user.click(
      within(free).getByRole('combobox', { name: 'Why is there no order?' }),
    );
    await user.click(
      await screen.findByRole('option', { name: 'Found in a count' }),
    );

    const count = await screen.findByRole('dialog', {
      name: 'Correct the count',
    });
    await user.click(
      within(count).getByRole('combobox', { name: /^Location/ }),
    );
    await user.click((await screen.findAllByRole('option'))[0]!);
    await user.type(
      within(count).getByRole('textbox', { name: /^Quantity/ }),
      '12',
    );
    await user.type(
      within(count).getByRole('textbox', { name: /^What happened/ }),
      'Behind the cartons',
    );
    await user.click(
      within(count).getByRole('button', { name: 'Save correction' }),
    );
    await waitFor(() => expect(count).not.toBeInTheDocument());
    await waitFor(() =>
      expect(
        screen.queryByRole('dialog', { name: 'Receive stock' }),
      ).not.toBeInTheDocument(),
    );

    await user.click(screen.getByRole('button', { name: 'Receive stock' }));
    const again = await screen.findByRole('dialog', { name: 'Receive stock' });
    expect(within(again).getByRole('combobox', { name: 'Item' })).toHaveValue(
      '',
    );
    expect(
      within(again).getByRole('combobox', { name: 'Why is there no order?' }),
    ).toHaveTextContent(/^\W*$/);
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

  // ADR-094's table: a receipt lands on Stock, its row open at its place,
  // the dialog Home opened closed for good.
  it('lands a receipt from ?receive on its row, open at its place, the dialog closed', async () => {
    answer();
    function Address() {
      const { search } = useLocation();
      return <output aria-label="address">{search}</output>;
    }
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory?receive']}>
        <Routes>
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
    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Receive stock' });
    const pick = async (label: string, option: RegExp | string) => {
      await user.click(within(dialog).getByRole('combobox', { name: label }));
      await user.click(await screen.findByRole('option', { name: option }));
    };

    await pick('Item', /PLAIN-1/);
    await pick('Why is there no order?', 'Opening stock');
    await pick('Into', /Main Site/);
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Quantity' }),
      '5',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Receive' }));

    await expect
      .poll(() => screen.queryByRole('dialog', { name: 'Receive stock' }))
      .toBeNull();
    expect(screen.getByRole('status', { name: 'address' })).toHaveTextContent(
      '?open=variant-plain%2Cvariant-plain.location-a',
    );
  });

  /**
   * Which rows are open is the address's alone (ADR-094, S1): a receipt
   * into a code already listed wrote `?open=` and its row stayed closed,
   * the row having read the address once, as it first appeared.
   */
  describe('the rows the address names open', () => {
    const CODE_OPEN = '/inventory?open=variant-1';
    const LOTS_OPEN = '/inventory?open=variant-1%2Cvariant-1.loc-1';

    /** Stock at an address, links that change it, and the address shown. */
    function renderWithLinks(address: string) {
      function Address() {
        const { search } = useLocation();
        return <output aria-label="address">{search}</output>;
      }
      return renderWithAuth(
        <MemoryRouter initialEntries={[address]}>
          <Link to={CODE_OPEN}>The code</Link>
          <Link to={LOTS_OPEN}>Its lots</Link>
          <Link to="/inventory">None</Link>
          <InventoryPage />
          <Address />
        </MemoryRouter>,
        { permissions: ['stock.view', 'locations.view'] },
      );
    }

    const places = () =>
      screen.findByRole('button', {
        name: /^2 places: (show|hide) where Vitamin D \(60ct\) is$/,
      });
    const lots = () =>
      screen.findByRole('button', {
        name: /^2 lots: (show|hide) the lots at Main warehouse › Zone A › Shelf A$/,
      });

    it('opens a row on screen, then its place’s lots, as the address comes to name each', async () => {
      const user = userEvent.setup();
      answer();
      renderWithLinks('/inventory');
      expect(await places()).toHaveAttribute('aria-expanded', 'false');

      await user.click(screen.getByRole('link', { name: 'The code' }));
      await vi.waitFor(async () =>
        expect(await places()).toHaveAttribute('aria-expanded', 'true'),
      );
      expect(await lots()).toHaveAttribute('aria-expanded', 'false');
      expect(screen.queryByText('NN-2410-07')).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'Its lots' }));
      await vi.waitFor(async () =>
        expect(await lots()).toHaveAttribute('aria-expanded', 'true'),
      );
      expect(screen.getByText('NN-2410-07')).toBeVisible();
    });

    it('closes a row on screen, and its place’s lots, as the address stops naming them', async () => {
      const user = userEvent.setup();
      answer();
      renderWithLinks(LOTS_OPEN);
      expect(await screen.findByText('NN-2410-07')).toBeVisible();

      await user.click(screen.getByRole('link', { name: 'The code' }));
      await vi.waitFor(async () =>
        expect(await lots()).toHaveAttribute('aria-expanded', 'false'),
      );
      expect(screen.queryByText('NN-2410-07')).not.toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'None' }));
      await vi.waitFor(async () =>
        expect(await places()).toHaveAttribute('aria-expanded', 'false'),
      );
      expect(
        screen.queryByText('Main warehouse › Zone A › Shelf A'),
      ).not.toBeInTheDocument();
    });

    it('puts a row opened by hand in the address, its place’s lots too, and takes both out as the row closes', async () => {
      const user = userEvent.setup();
      answer();
      renderWithLinks('/inventory');
      const address = screen.getByRole('status', { name: 'address' });

      await user.click(await places());
      expect(await lots()).toBeVisible();
      expect(address).toHaveTextContent('?open=variant-1');

      await user.click(await lots());
      expect(await screen.findByText('NN-2410-07')).toBeVisible();
      expect(address).toHaveTextContent('?open=variant-1%2Cvariant-1.loc-1');

      await user.click(await places());
      await vi.waitFor(async () =>
        expect(await places()).toHaveAttribute('aria-expanded', 'false'),
      );
      expect(address).toBeEmptyDOMElement();
    });
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
    // The list's own order marked on its header; the others a faint
    // up-and-down arrow at rest (Bob's third message, 4).
    expect(screen.getByRole('columnheader', { name: 'Item' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );
    const onHand = screen.getByRole('columnheader', { name: 'On hand' });
    expect(onHand).not.toHaveAttribute('aria-sort');
    expect(within(onHand).getByTestId('UnfoldMoreIcon')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'On hand' }));
    await expect.poll(() => asked.codes.at(-1)?.get('sort')).toBe('onHand');
    expect(asked.codes.at(-1)?.get('order')).toBe('asc');
    expect(
      screen.getByRole('columnheader', { name: 'On hand' }),
    ).toHaveAttribute('aria-sort', 'ascending');
    expect(
      within(screen.getByRole('columnheader', { name: 'On hand' })).getByTestId(
        'ArrowDownwardIcon',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('columnheader', { name: 'Item' })).getByTestId(
        'UnfoldMoreIcon',
      ),
    ).toBeInTheDocument();
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

    // Show all stock clears it with the filters, in one write, the box
    // following the address once the page shows it. The box emptied
    // first left the search to write itself from the address still
    // shown: where the page showed the cleared filters only after the
    // search's wait, that put Expired back on (PR CI runs 747 and 749).
    it('is cleared with the filters by Show all stock, in one write', async () => {
      answer([]);
      const router = heldRouter('/inventory?search=E2E-MAG&expired=1');
      renderWithAuth(
        <router.HeldRouter>
          <InventoryPage />
        </router.HeldRouter>,
        { permissions: ['stock.view'] },
      );
      const showAll = await screen.findByRole('button', {
        name: 'Show all stock',
      });

      // fireEvent, not userEvent: Testing Library's wrapper around
      // userEvent waits on a setTimeout the fake clock would hold.
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
      fireEvent.click(showAll);
      act(() => vi.advanceTimersByTime(SEARCH_WAIT_MS));
      expect(router.address()).toBe('/inventory');

      router.show();
      expect(
        screen.getByRole('searchbox', { name: 'Search items, codes or lots' }),
      ).toHaveValue('');
      act(() => vi.advanceTimersByTime(SEARCH_WAIT_MS));
      expect(router.address()).toBe('/inventory');
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
