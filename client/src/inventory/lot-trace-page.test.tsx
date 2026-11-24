import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { LotMatch, LotSource, LotTrace } from '../api/types.gen';
import { OFFER_BACK } from '../lib/offer-back';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LotSearchPage, LotTracePage } from './lot-trace-page';

const SOURCE: LotSource = {
  kind: 'receipt',
  reasonDetail: null,
  at: '2026-10-01T15:00:00Z',
  quantity: '10.0000',
  orderId: 'po-1',
  orderNumber: 'PO-000001',
  orderReference: null,
  partnerId: 'partner-acme',
  supplierName: 'Acme Supplies',
  fromLotId: null,
  fromLotCode: null,
  runId: null,
  runReference: null,
  licenceId: null,
  licenceNumber: null,
  licenceAuthority: null,
  licenceStatusAtRelease: null,
  licenceOverrideReason: null,
  licenceOverriddenByName: null,
};

/**
 * A lot received on a purchase, made into another in a run, and sold: a
 * partner, an order and a run each, in every section that names one.
 */
const TRACE: LotTrace = {
  lot: {
    id: 'lot-1',
    code: 'OIL-0425',
    expiresAt: null,
    expiry: 'none',
    isAssigned: false,
    supplierLot: null,
    variantId: 'variant-oil',
    productId: 'product-oil',
    sku: 'OIL',
    unitOfMeasure: 'kg',
    description: 'Fish oil',
  },
  balances: [
    {
      locationId: 'loc-1',
      locationName: 'Shelf A',
      locationCode: 'A',
      locationPath: ['Main warehouse', 'Zone A'],
      isAvailable: true,
      quantity: '48.0000',
    },
    {
      locationId: 'loc-2',
      locationName: 'Quarantine',
      locationCode: null,
      locationPath: ['Main warehouse'],
      isAvailable: false,
      quantity: '2.0000',
    },
  ],
  usable: '48.0000',
  notUsable: '2.0000',
  movedOnTo: [],
  sources: [
    SOURCE,
    {
      ...SOURCE,
      kind: 'production',
      orderId: null,
      orderNumber: null,
      partnerId: null,
      supplierName: null,
      runId: 'run-0',
      runReference: 'MO-000007',
    },
  ],
  madeFrom: [],
  wentInto: [
    {
      lotId: 'lot-2',
      code: 'CAPS-0425',
      sku: 'CAPS',
      depth: 1,
      runId: 'run-1',
      runReference: 'MO-000009',
    },
  ],
  recipients: [
    {
      partnerId: 'partner-1',
      partnerName: 'Northern Health',
      orderId: 'so-1',
      orderNumber: 'SO-000003',
      orderReference: null,
      isSampleOrder: false,
      lotId: 'lot-2',
      lotCode: 'CAPS-0425',
      lotSupplierLot: null,
      lotIsAssigned: false,
      sku: 'CAPS',
      shipped: '5.0000',
      sampled: '0.0000',
      returned: '0.0000',
      leftOn: '2026-10-20',
    },
  ],
};

function renderTrace(permissions: string[]) {
  server.use(
    http.get('/api/v1/stock/lots/lot-1/trace', () => HttpResponse.json(TRACE)),
  );

  return renderWithAuth(
    <MemoryRouter initialEntries={['/lots/lot-1']}>
      <Routes>
        <Route path="/lots/:id" element={<LotTracePage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

/** The partner, the two orders and the two runs the trace names. */
const ONWARD = [
  'Northern Health',
  'SO-000003',
  'PO-000001',
  'MO-000007',
  'MO-000009',
];

const PLACES_HIDDEN =
  'Warehouses, zones and bins are hidden: your role can’t see them. An Owner or Admin can change that.';
describe('LotTracePage', () => {
  it('links each partner, order and run for whoever may open it', async () => {
    renderTrace([
      'stock.view',
      'partners.view',
      'orders.view',
      'production.view',
    ]);

    expect(
      await screen.findByRole('link', { name: 'Northern Health' }),
    ).toHaveAttribute('href', '/partners/partner-1');
    expect(screen.getByRole('link', { name: 'SO-000003' })).toHaveAttribute(
      'href',
      '/orders/so-1',
    );
    expect(screen.getByRole('link', { name: 'PO-000001' })).toHaveAttribute(
      'href',
      '/orders/po-1',
    );
    expect(screen.getByRole('link', { name: 'MO-000007' })).toHaveAttribute(
      'href',
      '/production/run-0',
    );
    expect(screen.getByRole('link', { name: 'MO-000009' })).toHaveAttribute(
      'href',
      '/production/run-1',
    );
  });

  // Review 6: the way on to the lot's item and its movements, each for a
  // reader who may open that page; the movements with no days, the lot's
  // whole life, its first receipt among them (132b).
  it('links its item and All movements of this lot, each for whoever may open it', async () => {
    const { unmount } = renderTrace(['stock.view', 'products.view']);

    expect(
      await screen.findByRole('link', { name: 'Fish oil' }),
    ).toHaveAttribute('href', '/items/product-oil');
    const movements = screen.getByRole('link', {
      name: 'All movements of this lot',
    });
    expect(movements).toHaveAttribute(
      'href',
      '/movements?variantId=variant-oil&lotId=lot-1',
    );
    const days = new URLSearchParams(
      movements.getAttribute('href')?.split('?')[1],
    );
    expect(days.has('from')).toBe(false);
    expect(days.has('until')).toBe(false);
    unmount();

    renderTrace(['stock.view']);
    await screen.findByRole('link', { name: 'All movements of this lot' });
    expect(
      screen.queryByRole('link', { name: 'Fish oil' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText(/Fish oil/)).toBeVisible();
  });

  // A recall letter goes to everyone on it (ADR-044, amended; #473's 17).
  it('exports the recall list beside Who received it, each row with its day', async () => {
    renderTrace(['stock.view']);

    const heading = await screen.findByRole('heading', {
      name: 'Who received it',
    });
    expect(heading.parentElement).toContainElement(
      screen.getByRole('button', { name: 'Export' }),
    );
    expect(screen.getByRole('columnheader', { name: 'Date' })).toBeVisible();
    expect(screen.getByText('Oct 20, 2026')).toBeVisible();
  });

  // The page's numbers (#472's 24), and a lot past its day says so (#479).
  it('writes its quantities as the page does, and how long ago an expired lot expired', async () => {
    server.use(
      http.get('/api/v1/stock/lots/lot-1/trace', () =>
        HttpResponse.json({
          ...TRACE,
          lot: { ...TRACE.lot, expiresAt: '2020-01-01' },
        }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/lots/lot-1']}>
        <Routes>
          <Route path="/lots/:id" element={<LotTracePage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    expect(
      await screen.findByText(/^Expired \d[\d,]* days ago$/),
    ).toBeVisible();
    expect(screen.getByText(/expires Jan 1, 2020/)).toBeVisible();
    expect(screen.getByText('48 kg')).toBeVisible();
    expect(screen.getByText(/Acme Supplies/).parentElement).toHaveTextContent(
      '10 kg',
    );
    expect(screen.queryByText(/\.0000/)).not.toBeInTheDocument();
  });

  // Where it is now (#639; ADR-093, 96a): each place by its whole path,
  // its warehouse first, for a reader who may see places; for one who may
  // not, the two sums the server sends and no Location column.
  it('names each place where it is now by its whole path, or sums it for a reader without places', async () => {
    const { unmount } = renderTrace(['stock.view', 'locations.view']);

    expect(
      await screen.findByRole('cell', {
        name: 'Main warehouse › Zone A › Shelf A (A)',
      }),
    ).toBeVisible();
    expect(screen.queryByText(PLACES_HIDDEN)).not.toBeInTheDocument();
    expect(
      screen.getByRole('cell', {
        name: 'Main warehouse › Quarantine Not available',
      }),
    ).toBeVisible();
    unmount();

    renderTrace(['stock.view']);

    const heads = await screen.findAllByRole('columnheader');
    expect(heads.slice(0, 2).map((head) => head.textContent)).toEqual([
      'Usable',
      'Not usable',
    ]);
    expect(screen.getByRole('cell', { name: '48 kg' })).toBeVisible();
    expect(screen.getByRole('cell', { name: '2 kg' })).toBeVisible();
    expect(
      screen.queryByRole('columnheader', { name: 'Location' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/Shelf A|Quarantine/)).not.toBeInTheDocument();
    // Why, once, where the places would be (review 3, 115).
    expect(screen.getAllByText(PLACES_HIDDEN)).toHaveLength(1);
  });

  // Step 15's gap (S9): what moved on under another code is still on
  // hand there, so a recall reading this page finds it.
  it('lists the lots its stock moved on to under Where it is now, each a link with all it holds, by place or summed for a reader without places (S9)', async () => {
    const moved: LotTrace = {
      ...TRACE,
      movedOnTo: [
        {
          lotId: 'lot-b',
          code: 'OIL-0425-B',
          balances: [
            { ...TRACE.balances[0], quantity: '12.0000' },
            { ...TRACE.balances[1], quantity: '3.0000' },
          ],
          usable: '12.0000',
          notUsable: '3.0000',
        },
        {
          lotId: 'lot-c',
          code: 'OIL-0425-C',
          balances: [],
          usable: '0',
          notUsable: '0',
        },
      ],
    };
    const shown = (permissions: string[]) => {
      server.use(
        http.get('/api/v1/stock/lots/lot-1/trace', () =>
          HttpResponse.json(moved),
        ),
      );
      return renderWithAuth(
        <MemoryRouter initialEntries={['/lots/lot-1']}>
          <Routes>
            <Route path="/lots/:id" element={<LotTracePage />} />
          </Routes>
        </MemoryRouter>,
        { permissions },
      );
    };
    const rowsOf = () =>
      within(
        screen
          .getByRole('heading', { name: 'Moved on to' })
          .parentElement!.querySelector('table')!,
      )
        .getAllByRole('row')
        .map((row) =>
          [...row.querySelectorAll('th, td')].map((cell) => cell.textContent),
        );

    const { unmount } = shown(['stock.view', 'locations.view']);
    expect(
      await screen.findByRole('heading', { name: 'Moved on to' }),
    ).toBeVisible();
    expect(rowsOf()).toEqual([
      ['Lot', 'Location', 'Quantity'],
      ['OIL-0425-B', 'Main warehouse › Zone A › Shelf A (A)', '12 kg'],
      ['OIL-0425-B', 'Main warehouse › QuarantineNot available', '3 kg'],
      ['OIL-0425-C', '—', '0 kg'],
    ]);
    expect(
      screen.getAllByRole('link', { name: 'OIL-0425-B' })[0],
    ).toHaveAttribute('href', '/lots/lot-b');
    unmount();

    // No place named without locations.view: each lot's two sums.
    shown(['stock.view']);
    await screen.findByRole('heading', { name: 'Moved on to' });
    expect(rowsOf()).toEqual([
      ['Lot', 'Usable', 'Not usable'],
      ['OIL-0425-B', '12 kg', '3 kg'],
      ['OIL-0425-C', '0 kg', '0 kg'],
    ]);
    expect(screen.queryByText(/Shelf A|Quarantine/)).not.toBeInTheDocument();
  });

  it('says nothing of moved on lots where none of it moved', async () => {
    renderTrace(['stock.view', 'locations.view']);

    await screen.findByRole('heading', { name: 'Where it is now' });
    expect(
      screen.queryByRole('heading', { name: 'Moved on to' }),
    ).not.toBeInTheDocument();
  });

  // Stock look-up's reader (ADR-080): stock, but none of the three.
  it('names them as text for whoever may not, the lots still linked', async () => {
    renderTrace(['stock.view']);

    expect(
      await screen.findAllByRole('link', { name: 'CAPS-0425' }),
    ).toHaveLength(2);
    for (const name of ONWARD) {
      expect(screen.queryByRole('link', { name })).not.toBeInTheDocument();
      expect(screen.getByText(name, { exact: false })).toBeInTheDocument();
    }
  });
});

/** A window this wide, for the list's width switch; jsdom has none. */
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

/** The trace given, at the lot's own page. */
function renderTraced(trace: LotTrace, permissions: string[]) {
  server.use(
    http.get('/api/v1/stock/lots/lot-1/trace', () => HttpResponse.json(trace)),
  );
  return renderWithAuth(
    <MemoryRouter initialEntries={['/lots/lot-1']}>
      <Routes>
        <Route path="/lots/:id" element={<LotTracePage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
}

const RECIPIENT = TRACE.recipients[0];

/**
 * The recall list through a move between lots (ADR-094, R21): one
 * customer who received this lot, one who received a lot part of it
 * moved into, and a sample that left with no name.
 */
const MOVED: LotTrace = {
  ...TRACE,
  recipients: [
    {
      ...RECIPIENT,
      partnerId: 'partner-1',
      partnerName: 'Northern Health',
      lotId: 'lot-1',
      lotCode: 'OIL-0425',
    },
    {
      ...RECIPIENT,
      partnerId: 'partner-2',
      partnerName: 'Coastal Clinic',
      orderId: 'so-2',
      orderNumber: 'SO-000004',
      lotId: 'lot-b',
      lotCode: 'OIL-0425-B',
      shipped: '3.0000',
    },
    {
      ...RECIPIENT,
      partnerId: null,
      partnerName: null,
      orderId: null,
      orderNumber: null,
      lotId: 'lot-1',
      lotCode: 'OIL-0425',
      shipped: '0.0000',
      sampled: '2.0000',
      leftOn: '2026-10-22',
    },
  ],
};

describe('LotTracePage, ADR-094', () => {
  afterEach(() => vi.unstubAllGlobals());

  // R21, R11 and E2: a move names the lot it left, a link; a start lot
  // its stock on hand as tracking started and stock back from before;
  // a receipt with no order whom it came from and why; a kind this tab
  // does not know only that stock came in (D4).
  it('says where it came from: the lot it moved from, tracking started, back from before, and a receipt with no order from whom and why', async () => {
    renderTraced(
      {
        ...TRACE,
        sources: [
          {
            ...SOURCE,
            kind: 'lot_change',
            reasonDetail: 'between_lots',
            orderId: null,
            orderNumber: null,
            partnerId: null,
            supplierName: null,
            fromLotId: 'lot-a',
            fromLotCode: 'OIL-0425-A',
          },
          {
            ...SOURCE,
            kind: 'lot_change',
            reasonDetail: 'lots_started',
            orderId: null,
            orderNumber: null,
            partnerId: null,
            supplierName: null,
          },
          {
            ...SOURCE,
            kind: 'lot_change',
            reasonDetail: 'from_before',
            orderId: null,
            orderNumber: null,
            partnerId: null,
            supplierName: null,
          },
          {
            ...SOURCE,
            reasonDetail: 'opening',
            orderId: null,
            orderNumber: null,
            supplierName: 'Cascade Botanicals',
          },
          {
            ...SOURCE,
            reasonDetail: 'returned',
            orderId: null,
            orderNumber: null,
            partnerId: null,
            supplierName: null,
          },
          {
            ...SOURCE,
            kind: 'teleported' as LotSource['kind'],
            orderId: null,
            orderNumber: null,
            partnerId: null,
            supplierName: null,
          },
        ],
      },
      ['stock.view', 'partners.view'],
    );

    const heading = await screen.findByRole('heading', {
      name: 'Where it came from',
    });
    const lines = [
      ...(heading.closest('div')?.parentElement?.querySelectorAll('p') ?? []),
    ].map((line) => line.textContent?.split(' — ')[0]);
    expect(lines).toEqual([
      'Moved in from lot OIL-0425-A',
      'Stock on hand when lot tracking started',
      'Back from before lot tracking',
      'Received from Cascade Botanicals with no order: opening stock',
      'Received with no order: returned',
      'Came into this lot',
    ]);
    expect(screen.getByRole('link', { name: 'OIL-0425-A' })).toHaveAttribute(
      'href',
      '/lots/lot-a',
    );
    expect(
      screen.getByRole('link', { name: 'Cascade Botanicals' }),
    ).toHaveAttribute('href', '/partners/partner-acme');
  });

  // R6 and D2: both codes under its title, and an expiry not known yet
  // said so, never left out as one that does not expire.
  it('names its supplier’s lot and an expiry still to add under its title', async () => {
    renderTraced(
      {
        ...TRACE,
        lot: {
          ...TRACE.lot,
          isAssigned: true,
          supplierLot: 'HX-2609',
          expiry: 'unknown',
        },
      },
      ['stock.view'],
    );

    expect(
      await screen.findByText(
        /OIL · Fish oil · expiry to add · Supplier’s lot HX-2609/,
      ),
    ).toBeVisible();
  });

  // Review 1: Edit lot details on the lot's own page, one lot and no place
  // to choose, for whoever may move stock.
  it('edits the lot’s details from its own page for whoever may move stock, reading it again after', async () => {
    let sent: unknown = null;
    let reads = 0;
    server.use(
      http.get('/api/v1/stock/lots/lot-1/trace', () => {
        reads += 1;
        return HttpResponse.json({
          ...TRACE,
          lot: { ...TRACE.lot, isAssigned: true, expiry: 'unknown' },
        });
      }),
      http.patch('/api/v1/stock/lots/lot-1', async ({ request }) => {
        sent = await request.json();
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderWithAuth(
      <MemoryRouter initialEntries={['/lots/lot-1']}>
        <Routes>
          <Route path="/lots/:id" element={<LotTracePage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view', 'stock.move'] },
    );

    await user.click(
      await screen.findByRole('button', { name: 'Edit lot details…' }),
    );
    const dialog = await screen.findByRole('dialog', { name: /^Lot OIL-0425/ });
    expect(dialog).toHaveTextContent('This changes the lot everywhere it is.');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Supplier’s lot' }),
      'HX-2609',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(sent).toMatchObject({ supplierLot: 'HX-2609', expiry: 'unknown' });
    await waitFor(() => expect(reads).toBe(2));
  });

  it('offers no Edit lot details to whoever may not move stock', async () => {
    renderTraced(TRACE, ['stock.view']);

    await screen.findByRole('heading', { name: /^Lot OIL-0425/ });
    expect(
      screen.queryByRole('button', { name: 'Edit lot details…' }),
    ).not.toBeInTheDocument();
  });

  // Review 46: a lot reached from a lot's page offers Back to it.
  it('offers Back on the lot a recipient came through, reached from this lot', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/stock/lots/:id/trace', () => HttpResponse.json(MOVED)),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/lots/lot-1']}>
        <Routes>
          <Route path="/lots/:id" element={<LotTracePage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    expect(
      screen.queryByRole('button', { name: 'Back' }),
    ).not.toBeInTheDocument();
    await user.click(await screen.findByRole('link', { name: 'OIL-0425-B' }));
    expect(
      await screen.findByRole('button', { name: 'Back' }),
    ).toBeInTheDocument();
  });

  // R21's column: the lot a row came through, where it is not this one,
  // a link to that lot's page (the interaction table's row).
  it('says the lot each recipient received it through, this lot’s own rows none', async () => {
    widthIs(1280);
    renderTraced(MOVED, ['stock.view', 'partners.view']);

    const table = await screen.findByRole('table', { name: 'Who received it' });
    const heads = within(table)
      .getAllByRole('columnheader')
      .map((head) => head.textContent);
    expect(heads).toEqual([
      'Who',
      'Order',
      'Through lot',
      'Shipped',
      'Sampled',
      'Returned',
      'Date',
    ]);
    const [own, moved, unnamed] = within(table).getAllByRole('row').slice(1);
    expect(within(own).getAllByRole('cell')[2]).toHaveTextContent(/^—$/);
    expect(
      within(moved).getByRole('link', { name: 'OIL-0425-B' }),
    ).toHaveAttribute('href', '/lots/lot-b');
    expect(within(unnamed).getAllByRole('cell')[2]).toHaveTextContent(/^—$/);
  });

  // #620: how many the recall must reach, above the list; pressed, the
  // list's heading takes focus.
  it('says above how many partners received it, and that some left with no recipient, leading to the list', async () => {
    const user = userEvent.setup();
    renderTraced(MOVED, ['stock.view']);

    const count = await screen.findByRole('button', {
      name: 'Received by 2 partners, and some with no recipient recorded',
    });
    await user.click(count);
    expect(
      screen.getByRole('heading', { name: 'Who received it' }),
    ).toHaveFocus();
  });

  it('says above when nothing has left, and when no recipient was recorded at all', async () => {
    const { unmount } = renderTraced({ ...TRACE, recipients: [] }, [
      'stock.view',
    ]);
    expect(
      await screen.findAllByText(
        'Nothing from this lot has left the business.',
      ),
    ).toHaveLength(2);
    unmount();

    renderTraced({ ...MOVED, recipients: [MOVED.recipients[2]] }, [
      'stock.view',
    ]);
    expect(
      await screen.findByRole('button', {
        name: 'Left with no recipient recorded',
      }),
    ).toBeVisible();
  });

  // #617: on a phone each recipient is a card with what it received, the
  // numbers that matter alone, the lot it came through where not this.
  it('lists each recipient as a card below 600 px, a sample’s by what it sampled', async () => {
    widthIs(390);
    renderTraced(MOVED, ['stock.view']);

    const list = await screen.findByRole('list', { name: 'Who received it' });
    expect(
      screen.queryByRole('table', { name: 'Who received it' }),
    ).not.toBeInTheDocument();
    const [own, moved, unnamed] = within(list).getAllByRole('listitem');
    expect(own).toHaveTextContent('Northern Health');
    expect(own).toHaveTextContent('Shipped5');
    expect(own).not.toHaveTextContent('Through lot');
    expect(moved).toHaveTextContent('Through lotOIL-0425-B');
    expect(unnamed).toHaveTextContent('No recipient recorded');
    expect(unnamed).toHaveTextContent('Sampled2');
    expect(unnamed).not.toHaveTextContent('Shipped');
    expect(unnamed).toHaveTextContent('DateOct 22, 2026');
  });
});

describe('LotSearchPage', () => {
  // Opened by a link that offered Back, a search keeps it (#341).
  it('keeps Back after a search, when a link inside the app opened it', async () => {
    const lot = (code: string): LotMatch => ({
      id: `lot-${code}`,
      code,
      expiresAt: null,
      expiry: 'none',
      supplierLot: null,
      isAssigned: false,
      sku: 'FOCUS-60CT',
    });
    server.use(
      http.get('/api/v1/stock/lots/search', () =>
        HttpResponse.json([lot('BF-2609'), lot('FOC-2609-01')]),
      ),
    );
    renderWithAuth(
      <MemoryRouter
        initialEntries={[
          '/inventory',
          { pathname: '/lots', state: OFFER_BACK },
        ]}
        initialIndex={1}
      >
        <Routes>
          <Route path="/lots" element={<LotSearchPage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    await userEvent.type(
      screen.getByRole('textbox', { name: 'Lot code or supplier’s lot' }),
      '2609{Enter}',
    );

    expect(await screen.findByRole('link', { name: 'BF-2609' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  // A match found by the supplier's lot says why, as the lookup's lot
  // row does (ADR-094, S10); the field asks for either code.
  it('names each match’s supplier’s lot, or that a code made here has none yet, and asks for either code', async () => {
    const found: LotMatch[] = [
      {
        id: 'lot-made',
        code: 'L-2026-11-21-1',
        expiresAt: null,
        expiry: 'unknown',
        supplierLot: 'HX-2609',
        isAssigned: true,
        sku: 'FOCUS-60CT',
      },
      {
        id: 'lot-to-add',
        code: 'L-2026-11-21-2',
        expiresAt: null,
        expiry: 'none',
        supplierLot: null,
        isAssigned: true,
        sku: 'FOCUS-60CT',
      },
      {
        id: 'lot-printed',
        code: 'FOC-2609-01',
        expiresAt: null,
        expiry: 'none',
        supplierLot: null,
        isAssigned: false,
        sku: 'FOCUS-60CT',
      },
    ];
    server.use(
      http.get('/api/v1/stock/lots/search', () => HttpResponse.json(found)),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/lots?code=2609']}>
        <Routes>
          <Route path="/lots" element={<LotSearchPage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    const field = screen.getByRole('textbox', {
      name: 'Lot code or supplier’s lot',
    });
    expect(field).toHaveAccessibleDescription(
      'Any part of either works — the batch number is usually enough. Press Enter to search.',
    );
    const cellOf = async (code: string) =>
      (await screen.findByRole('link', { name: code })).closest('td');
    expect(await cellOf('L-2026-11-21-1')).toHaveTextContent(
      'L-2026-11-21-1Supplier’s lot HX-2609',
    );
    expect(await cellOf('L-2026-11-21-2')).toHaveTextContent(
      'L-2026-11-21-2Supplier’s lot to add',
    );
    expect(await cellOf('FOC-2609-01')).toHaveTextContent(/^FOC-2609-01$/);
  });
});
