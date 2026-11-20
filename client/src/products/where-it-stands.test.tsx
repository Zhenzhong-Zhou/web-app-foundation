import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  CodeStanding,
  ProductDetail,
  ReorderPointDetail,
} from '../api/types.gen';
import { movement } from '../test/factories';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { WhereItStands } from './where-it-stands';

const PRODUCT = {
  id: 'product-1',
  displayName: 'Elderberry syrup',
} as ProductDetail;

/** A code of Where it stands, as the server sends it to an Owner. */
function standing(over: Partial<CodeStanding> = {}): CodeStanding {
  return {
    variantId: 'variant-1',
    sku: 'ELDER-250',
    variantName: '250 ml',
    unitOfMeasure: 'each',
    isActive: true,
    onHand: '82.0000',
    usable: '70.0000',
    notUsable: '12.0000',
    expired: '8.0000',
    issued: '0.0000',
    unavailable: '4.0000',
    held: '70.0000',
    free: '0.0000',
    stillNeeded: '90.0000',
    short: '20.0000',
    coming: '0.0000',
    comingOn: null,
    position: '-20.0000',
    expiresFirst: null,
    reorderPoint: '96.0000',
    status: 'out',
    source: 'bought',
    suggestion: '30.0000',
    heldOrders: 2,
    holds: [
      {
        orderId: 'order-11',
        number: 'SO-000011',
        partnerName: 'Harbour Health',
        expectedAt: null,
        wanted: '70.0000',
        held: '70.0000',
        short: '0.0000',
      },
      {
        orderId: 'order-17',
        number: 'SO-000017',
        partnerName: 'Lam Herbal',
        expectedAt: null,
        wanted: '20.0000',
        held: '0.0000',
        short: '20.0000',
      },
    ],
    purchases: [],
    runs: [],
    places: [],
    lots: null,
    latestMovements: [],
    ...over,
  };
}

/** Where a link landed, and whether it offered Back. */
function Landed() {
  const { pathname, search, state } = useLocation();
  const back = (state as { offerBack?: boolean } | null)?.offerBack === true;
  return <p>{`${pathname}${search}${back ? ' with Back' : ''}`}</p>;
}

function renderStanding(
  codes: CodeStanding[],
  permissions: string[],
  at = '/items/product-1',
) {
  server.use(
    http.get('/api/v1/products/:id/stock', () => HttpResponse.json({ codes })),
    http.get('/api/v1/account/membership', () =>
      HttpResponse.json({
        roles: [{ name: 'Sales', description: null }],
        holdsEverything: false,
        whomToAsk: [{ id: 'user-1', name: 'Demo Owner' }],
      }),
    ),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={[at]}>
      <Routes>
        <Route
          path="/items/:id"
          element={<WhereItStands product={PRODUCT} />}
        />
        <Route path="/movements" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

describe('Where it stands (ADR-093, R8)', () => {
  // Stock's "20 short" opens the item's page at Held, focus on it, its
  // orders oldest first, the last the one short (16a).
  it('draws each figure with what is behind it, and opens at Held with focus on it', async () => {
    renderStanding(
      [standing()],
      ['stock.view', 'orders.view', 'orders.create', 'stock.reorder'],
      '/items/product-1#held',
    );

    expect(
      await screen.findByRole('heading', { name: 'Where it stands' }),
    ).toBeVisible();
    await waitFor(() =>
      expect(document.activeElement).toHaveAttribute('id', 'held'),
    );
    const held = document.getElementById('held')!;
    expect(held).toHaveTextContent('for 2 confirmed orders');
    expect(
      within(held).getByRole('link', { name: 'SO-000017' }),
    ).toHaveAttribute('href', '/orders/order-17');
    expect(held).toHaveTextContent(
      'SO-000017 · Lam Herbal · 0 of 20 held · 20 short',
    );

    expect(
      screen.getByText('12 not usable: expired and at a place not available'),
    ).toBeVisible();
    expect(screen.getByText('20 short: orders want 90')).toBeVisible();
    expect(
      screen.getByText('70 usable + 0 coming − 90 for orders'),
    ).toBeVisible();
    expect(screen.getByText('-20 left · reorder at 96')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Buy 30' })).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Change reorder point' }),
    ).toBeVisible();
  });

  // What a reader may not see the server leaves out; the screen draws
  // what came, and a main action the role cannot use names whom to ask.
  it('names whom to ask for Buy, and lists the usable lots without places', async () => {
    renderStanding(
      [
        standing({
          holds: null,
          purchases: null,
          runs: null,
          places: null,
          lots: [
            {
              lotId: 'lot-1',
              lotCode: 'ELD-25A',
              expiresAt: null,
              quantity: '70.0000',
              places: 2,
            },
          ],
        }),
      ],
      ['stock.view'],
    );

    expect(
      await screen.findByText(
        'Your role does not include buying. To do more, ask Demo Owner.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Buy/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /reorder point/ })).toBeNull();
    expect(screen.queryByRole('link', { name: /^SO-/ })).toBeNull();
    expect(screen.getByText('for 2 confirmed orders')).toBeVisible();
    expect(screen.getByRole('link', { name: 'ELD-25A' })).toHaveAttribute(
      'href',
      '/lots/lot-1',
    );
    expect(screen.getByText('in 2 places')).toBeVisible();
    expect(screen.getByText('12 not usable')).toBeVisible();
  });

  // None on hand and no point: the next step by role (ADR-093's states).
  it('says what to do first for a code with nothing, by role', async () => {
    renderStanding(
      [
        standing({
          onHand: '0.0000',
          usable: '0.0000',
          notUsable: '0.0000',
          expired: '0.0000',
          unavailable: '0.0000',
          held: '0.0000',
          stillNeeded: '0.0000',
          short: '0.0000',
          position: '0.0000',
          reorderPoint: null,
          status: null,
          source: null,
          suggestion: null,
          heldOrders: 0,
          holds: [],
        }),
      ],
      ['stock.view', 'stock.reorder'],
    );

    expect(
      await screen.findByText(
        'None on hand, nothing coming. Set a reorder point to be told when it runs low.',
      ),
    ).toBeVisible();
    expect(
      screen.getByRole('button', { name: 'Set a reorder point' }),
    ).toBeVisible();
    expect(
      await screen.findByText(
        'Your role does not include receiving stock. To do more, ask Demo Owner.',
      ),
    ).toBeVisible();
  });

  // The dialog closes once its point is saved, and the section reads
  // again, so the status and its line show the point just set (#50 of
  // the review).
  it('closes the reorder point dialog after Save, and reads again', async () => {
    const point: ReorderPointDetail = {
      point: {
        source: 'bought',
        reorderPoint: '96.0000',
        rule: 'fixed',
        fixedQuantity: '30.0000',
        maximumQuantity: null,
      },
      usable: [],
      expired: '0.0000',
      issued: '0.0000',
      coming: [],
      stillNeeded: [],
    };
    let reads = 0;
    let saved = false;
    server.use(
      http.get('/api/v1/products/:id/stock', () => {
        reads += 1;
        return HttpResponse.json({ codes: [standing()] });
      }),
      http.get('/api/v1/stock/reorder-points/:variantId/preview', () =>
        HttpResponse.json({
          position: '-20.0000',
          status: 'out',
          suggestion: '30.0000',
          suggestedMultiples: '1',
          drafted: false,
          inDraft: '0.0000',
          after: '10.0000',
          afterStatus: 'low',
        }),
      ),
      http.get('/api/v1/stock/reorder-points/:variantId', () =>
        HttpResponse.json(point),
      ),
      http.put('/api/v1/stock/reorder-points/:variantId', () => {
        saved = true;
        return HttpResponse.json(point.point);
      }),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/items/product-1']}>
        <Routes>
          <Route
            path="/items/:id"
            element={<WhereItStands product={PRODUCT} />}
          />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view', 'stock.reorder'] },
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Change reorder point' }),
    );
    const dialog = await screen.findByRole('dialog', {
      name: 'Edit reorder point',
    });
    await userEvent.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(saved).toBe(true);
    await waitFor(() => expect(reads).toBe(2));
  });

  // Review 47: the places are Move's alone, read once it opens, not on
  // every visit. Each lot's actions are its Actions menu, as on Stock
  // (Bob's fourth message).
  it('gives each lot its Actions menu, and reads the places only when Move first opens', async () => {
    let placesRead = 0;
    const leaf = (id: string, name: string) => ({
      id,
      type: 'shelf',
      name,
      code: null,
      parentId: null,
      isAvailable: true,
      isActive: true,
      address: null,
    });
    server.use(
      http.get('/api/v1/locations', () => {
        placesRead += 1;
        return HttpResponse.json([
          leaf('loc-1', 'Shelf A'),
          leaf('loc-2', 'Shelf B'),
        ]);
      }),
    );
    renderStanding(
      [
        standing({
          places: [
            {
              locationId: 'loc-1',
              locationName: 'Shelf A',
              locationCode: null,
              locationPath: ['Main warehouse', 'Zone A'],
              isAvailable: true,
              onHand: '70.0000',
              lots: [
                {
                  id: 'pile-1',
                  variantId: 'variant-1',
                  sku: 'ELDER-250',
                  productName: 'Elderberry syrup',
                  variantName: '250 ml',
                  unitOfMeasure: 'each',
                  locationId: 'loc-1',
                  locationName: 'Shelf A',
                  locationCode: null,
                  lotId: 'lot-1',
                  lotCode: 'EB-01',
                  lotExpiresAt: null,
                  lotIsAssigned: true,
                  quantity: '70.0000',
                  emptiedOn: null,
                },
              ],
            },
          ],
        }),
      ],
      [
        'products.view',
        'stock.view',
        'stock.move',
        'stock.adjust',
        'locations.view',
      ],
    );

    const actions = await screen.findByRole('button', {
      name: 'Actions for lot EB-01 at Shelf A',
    });
    expect(screen.queryByRole('button', { name: /^Move/ })).toBeNull();
    expect(placesRead).toBe(0);
    // The place as Stock writes it, its warehouse path first (57a).
    expect(
      screen.getAllByText('Main warehouse › Zone A › Shelf A')[0],
    ).toBeInTheDocument();

    await userEvent.click(actions);
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
      expect(within(menu).getByRole('menuitem', { name })).toBeVisible();
    }
    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'Move…' }),
    );
    const dialog = await screen.findByRole('dialog');
    expect(placesRead).toBe(1);
    await userEvent.click(within(dialog).getByRole('combobox', { name: /To/ }));
    expect(
      await screen.findByRole('option', { name: 'Shelf B' }),
    ).toBeInTheDocument();
    await userEvent.keyboard('{Escape}');
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    );
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

    // Movements, the lot's, in place of the history dialog (R11).
    await userEvent.click(actions);
    await userEvent.click(
      within(await screen.findByRole('menu')).getByRole('menuitem', {
        name: 'Movements',
      }),
    );
    expect(
      await screen.findByText(
        '/movements?variantId=variant-1&lotId=lot-1 with Back',
      ),
    ).toBeInTheDocument();
  });

  // v2's board: the code's five newest as a stock card, In, Out and
  // Balance, each lot with its expiry, and All movements of the code
  // (R12).
  it('lists the code’s latest movements as a stock card, with All movements of the code', async () => {
    renderStanding(
      [
        standing({
          latestMovements: [
            movement({
              id: 'movement-2',
              variantId: 'variant-1',
              sku: 'ELDER-250',
              currentSku: 'ELDER-250',
              quantity: '4.0000',
              quantityIn: null,
              quantityOut: '4.0000',
              balance: '82.0000',
            }),
            movement({
              id: 'movement-1',
              variantId: 'variant-1',
              sku: 'ELDER-250',
              currentSku: 'ELDER-250',
              reason: 'receipt',
              quantity: '86.0000',
              fromLocationId: null,
              fromLocationName: null,
              fromLocationCode: null,
              fromLocationPath: [],
              toLocationId: 'location-shelf-a',
              toLocationName: 'Shelf A',
              toLocationCode: 'A',
              toLocationPath: ['Main warehouse'],
              quantityIn: '86.0000',
              quantityOut: null,
              balance: '86.0000',
            }),
          ],
        }),
      ],
      ['stock.view', 'locations.view'],
    );

    const heading = await screen.findByRole('heading', {
      name: 'Latest movements',
    });
    const table = heading.parentElement!.querySelector('table')!;
    expect(
      within(table)
        .getAllByRole('columnheader')
        .map((cell) => cell.textContent),
    ).toEqual([
      'When',
      'In',
      'Out',
      'Balance',
      'Reason',
      'From → to',
      'Lot',
      'For',
      'By',
    ]);
    const [, newest, oldest] = within(table).getAllByRole('row');
    expect(within(newest).getAllByRole('cell')[3]).toHaveTextContent('82 each');
    expect(within(oldest).getAllByRole('cell')[1]).toHaveTextContent('86 each');

    await userEvent.click(
      screen.getByRole('link', { name: 'All movements of ELDER-250' }),
    );
    expect(
      await screen.findByText('/movements?variantId=variant-1 with Back'),
    ).toBeInTheDocument();
  });

  it('lists no latest movements before anything has moved', async () => {
    renderStanding([standing()], ['stock.view']);

    await screen.findByRole('heading', { name: 'Where it stands' });
    expect(
      screen.queryByRole('heading', { name: 'Latest movements' }),
    ).toBeNull();
    expect(screen.queryByRole('link', { name: /^All movements/ })).toBeNull();
  });

  // v2's board (Bob's fourth message): one code, the title inside its
  // card with its actions on the same line, the status under them; Left
  // below zero in the short colour.
  it('puts the title in its card beside its actions, the status under them, Left below zero in red', async () => {
    renderStanding(
      [standing()],
      ['stock.view', 'orders.view', 'orders.create', 'stock.reorder'],
    );

    const title = await screen.findByRole('heading', {
      name: 'Where it stands',
    });
    const card = title.closest<HTMLElement>('.MuiPaper-root')!;
    expect(card).not.toBeNull();
    expect(within(card).getByRole('button', { name: 'Buy 30' })).toBeVisible();
    expect(
      within(card).getByRole('button', { name: 'Change reorder point' }),
    ).toBeVisible();
    const status = within(card).getByText('-20 left · reorder at 96');
    // The status under the title's line, not on it.
    expect(
      title.compareDocumentPosition(status) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(title.parentElement!.contains(status)).toBe(false);

    const valueOf = (label: string) =>
      screen.getByText(label, { selector: 'dt' }).nextElementSibling!;
    const red = getComputedStyle(
      screen.getByText('20 short: orders want 90'),
    ).color;
    expect(getComputedStyle(valueOf('Left')).color).toBe(red);
    expect(getComputedStyle(valueOf('On hand')).color).not.toBe(red);
  });

  // Several codes: the section's title above them, each card titled by
  // its code; a code without a point has no status line.
  it('titles each card by its code when there are several, the status only with a point', async () => {
    renderStanding(
      [
        standing(),
        standing({
          variantId: 'variant-2',
          sku: 'ELDER-500',
          variantName: '500 ml',
          position: '30.0000',
          reorderPoint: null,
          status: null,
          source: null,
          suggestion: null,
        }),
      ],
      ['stock.view', 'stock.reorder'],
    );

    const title = await screen.findByRole('heading', {
      name: 'Where it stands',
    });
    expect(title.closest('.MuiPaper-root')).toBeNull();
    const second = screen
      .getByRole('heading', { name: '500 ml · ELDER-500' })
      .closest<HTMLElement>('.MuiPaper-root')!;
    expect(within(second).queryByText(/reorder at/)).toBeNull();
    expect(
      within(second).getByRole('button', { name: 'Set a reorder point' }),
    ).toBeVisible();
  });

  it('is not drawn, nor read, without stock.view', () => {
    let read = false;
    server.use(
      http.get('/api/v1/products/:id/stock', () => {
        read = true;
        return HttpResponse.json({ codes: [] });
      }),
    );
    renderWithAuth(
      <MemoryRouter>
        <WhereItStands product={PRODUCT} />
      </MemoryRouter>,
      { permissions: ['products.view'] },
    );

    expect(screen.queryByRole('heading')).toBeNull();
    expect(read).toBe(false);
  });
});
