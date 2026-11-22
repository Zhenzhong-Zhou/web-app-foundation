import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { LotMatch, LotSource, LotTrace } from '../api/types.gen';
import { OFFER_BACK } from '../lib/offer-back';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { LotSearchPage, LotTracePage } from './lot-trace-page';

const SOURCE: LotSource = {
  kind: 'receipt',
  at: '2026-10-01T15:00:00Z',
  quantity: '10.0000',
  orderId: 'po-1',
  orderNumber: 'PO-000001',
  orderReference: null,
  supplierName: 'Acme Supplies',
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
  sources: [
    SOURCE,
    {
      ...SOURCE,
      kind: 'production',
      orderId: null,
      orderNumber: null,
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

describe('LotSearchPage', () => {
  // Opened by a link that offered Back, a search keeps it (#341).
  it('keeps Back after a search, when a link inside the app opened it', async () => {
    const lot = (code: string): LotMatch => ({
      id: `lot-${code}`,
      code,
      expiresAt: null,
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
      screen.getByRole('textbox', { name: 'Lot code' }),
      '2609{Enter}',
    );

    expect(await screen.findByRole('link', { name: 'BF-2609' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });
});
