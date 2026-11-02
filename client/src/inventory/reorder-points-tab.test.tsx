import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ReorderPointDetail, ReorderPointRow } from '../api/types.gen';
import { orderFillOf } from '../orders/order-fill';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';

function point(over: Partial<ReorderPointRow>): ReorderPointRow {
  return {
    id: `point-${over.sku}`,
    variantId: `variant-${over.sku}`,
    sku: 'D3-1000',
    productName: 'Vitamin D3',
    variantName: null,
    unitOfMeasure: 'each',
    source: 'bought',
    reorderPoint: '96.0000',
    rule: 'fixed',
    fixedQuantity: '48.0000',
    maximumQuantity: null,
    usable: '20.0000',
    coming: '0.0000',
    stillNeeded: '0.0000',
    inDraft: '0.0000',
    position: '20.0000',
    status: 'low',
    suggestion: '96.0000',
    suggestedMultiples: '2',
    drafted: false,
    drafts: [],
    ...over,
  };
}

const ROWS = [
  point({ sku: 'D3-1000' }),
  point({
    sku: 'OMEGA3-90',
    rule: 'just_enough',
    fixedQuantity: null,
    suggestion: '0.0000',
    suggestedMultiples: null,
    drafted: true,
    inDraft: '120.0000',
    drafts: [
      {
        kind: 'purchase',
        id: 'po-13',
        number: 'PO-DEMO-13',
        quantity: '120.0000',
      },
    ],
  }),
  point({
    sku: 'SLEEP-60CT',
    source: 'made',
    rule: 'just_enough',
    fixedQuantity: null,
    suggestion: '230.0000',
    suggestedMultiples: null,
  }),
  point({
    sku: 'BOTTLE-90',
    status: 'enough',
    position: '400.0000',
    suggestion: '0.0000',
    suggestedMultiples: null,
  }),
];

const DETAIL: ReorderPointDetail = {
  point: {
    source: 'bought',
    reorderPoint: '96.0000',
    rule: 'fixed',
    fixedQuantity: '48.0000',
    maximumQuantity: null,
  },
  usable: [
    {
      locationId: 'loc-1',
      locationName: 'Shelf A',
      usable: '20.0000',
      expired: '0.0000',
      issued: '0.0000',
    },
  ],
  expired: '6.0000',
  issued: '0.0000',
  coming: [],
  stillNeeded: [],
  drafts: [],
};

/** Where Raise a purchase order goes: what it fills New order with. */
function NewOrder() {
  const { state } = useLocation();
  return <p>New order: {JSON.stringify(orderFillOf(state))}</p>;
}

function open(
  permissions: string[],
  address = '/inventory?tab=reorder-points',
  { rows = ROWS, counts = { all: 4, low: 3, out: 0 } } = {},
) {
  const asked: URL[] = [];
  server.use(
    http.get('/api/v1/stock/reorder-points', ({ request }) => {
      asked.push(new URL(request.url));
      return HttpResponse.json({ entries: rows, nextCursor: null });
    }),
    http.get('/api/v1/stock/reorder-points/counts', () =>
      HttpResponse.json(counts),
    ),
    http.get('/api/v1/stock/reorder-points/:variantId', () =>
      HttpResponse.json(DETAIL),
    ),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/inventory" element={<InventoryPage />} />
        <Route path="/orders/new" element={<NewOrder />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
  return asked;
}

describe('Reorder points', () => {
  it('gives a box only to a bought low item with something to order, a drafted one disabled', async () => {
    open(['stock.view', 'orders.create']);

    expect(
      await screen.findByRole('checkbox', { name: 'Choose D3-1000' }),
    ).toBeEnabled();
    expect(
      screen.getByRole('checkbox', {
        name: 'OMEGA3-90 is in a draft already, which covers what it needs.',
      }),
    ).toBeDisabled();
    // Made, or with enough: nothing to raise a purchase order for.
    expect(
      screen.queryByRole('checkbox', { name: /SLEEP-60CT|BOTTLE-90/ }),
    ).not.toBeInTheDocument();
    // The drafted row says what is in draft, linked, and suggests nothing.
    const drafted = screen.getByRole('row', { name: /OMEGA3-90/ });
    expect(within(drafted).getByText('Drafted')).toBeInTheDocument();
    expect(within(drafted).getByText('PO-DEMO-13')).toBeInTheDocument();
    // A fixed rule's suggestion in its multiples.
    const fixed = screen.getByRole('row', { name: /D3-1000/ });
    expect(within(fixed).getByText('2 × 48')).toBeInTheDocument();
  });

  it('shows what is chosen in the bar until it is cleared, and the header’s box chooses every row it can', async () => {
    open(['stock.view', 'orders.create']);

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Choose D3-1000' }),
    );
    const bar = screen.getByRole('region', { name: 'Chosen to order' });
    expect(within(bar).getByText('1 chosen')).toBeInTheDocument();
    expect(within(bar).getByText('D3-1000 · 96')).toBeInTheDocument();

    await userEvent.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(
      screen.queryByRole('region', { name: 'Chosen to order' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Choose every item to order' }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Choose D3-1000' }),
    ).toBeChecked();
    expect(screen.getByText('1 chosen')).toBeInTheDocument();
  });

  it('gives a Viewer the same list with no boxes, and still opens a row', async () => {
    open(['stock.view']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Where D3-1000 stands' }),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(await screen.findByText('Shelf A')).toBeInTheDocument();
    expect(screen.getByText('6 left out as expired')).toBeInTheDocument();
  });

  it('gives whoever may set a point Add and a menu on each row', async () => {
    open(['stock.view', 'stock.reorder']);

    expect(
      await screen.findByRole('button', { name: 'Add reorder point' }),
    ).toBeInTheDocument();
    await userEvent.click(
      await screen.findByRole('button', {
        name: 'Actions for D3-1000’s reorder point',
      }),
    );
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual([
      'Edit reorder point',
      'Stock of the item',
      'Remove reorder point',
    ]);
  });

  it('gives a Viewer no Add and no menu', async () => {
    open(['stock.view']);

    expect(
      await screen.findByRole('button', { name: 'Where D3-1000 stands' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Add reorder point' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('says what a point does while there is none, with Add', async () => {
    open(['stock.view', 'stock.reorder'], undefined, {
      rows: [],
      counts: { all: 0, low: 0, out: 0 },
    });

    expect(
      await screen.findByText('No reorder points yet.'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/A reorder point says when an item runs short/),
    ).toBeInTheDocument();
    expect(
      screen.getAllByRole('button', { name: 'Add reorder point' }),
    ).toHaveLength(2);
  });

  it('says nothing is low, with how many have a point, and shows all', async () => {
    const asked = open(
      ['stock.view'],
      '/inventory?tab=reorder-points&status=low',
      { rows: [], counts: { all: 9, low: 0, out: 0 } },
    );

    expect(
      await screen.findByText('Nothing is low. 9 items have a reorder point.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(
      await screen.findByRole('button', { name: /^All\s*9$/, pressed: true }),
    ).toBeInTheDocument();
    expect(asked.at(-1)?.searchParams.has('status')).toBe(false);
  });

  it('opens on Low from the address, with the counts beside each view', async () => {
    const asked = open(
      ['stock.view'],
      '/inventory?tab=reorder-points&status=low',
    );

    expect(
      await screen.findByRole('button', { name: /^Low\s*3$/, pressed: true }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^All\s*4$/ }),
    ).toBeInTheDocument();
    expect(asked[0].searchParams.get('status')).toBe('low');
  });

  it('raises a purchase order of what is chosen, each at its suggestion', async () => {
    open(['stock.view', 'orders.create']);

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Choose D3-1000' }),
    );
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Chosen to order' })).getByRole(
        'button',
        { name: 'Raise a purchase order' },
      ),
    );

    expect(
      await screen.findByText(
        `New order: ${JSON.stringify({
          lines: [{ variantId: 'variant-D3-1000', quantity: '96.0000' }],
        })}`,
      ),
    ).toBeInTheDocument();
  });

  it('offers Plan a run on a made low row to whoever may plan one, filled in, and reads the list again once planned', async () => {
    const asked = open(['stock.view', 'production.create']);
    server.use(
      http.get('/api/v1/products/variants', () =>
        HttpResponse.json([
          {
            id: 'variant-SLEEP-60CT',
            sku: 'SLEEP-60CT',
            variantName: null,
            productName: 'Vitamin D3',
            type: 'good',
            unitOfMeasure: 'each',
            tracksLots: false,
          },
        ]),
      ),
      http.post('/api/v1/production-orders', () =>
        HttpResponse.json(
          { productionOrder: { id: 'run-1' } },
          { status: 201 },
        ),
      ),
    );

    // Bought, or drafted: none.
    await screen.findByRole('row', { name: /SLEEP-60CT/ });
    expect(
      screen.getAllByRole('button', { name: /^Plan a run of/ }),
    ).toHaveLength(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Plan a run of SLEEP-60CT' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Plan a run' });
    expect(
      within(dialog).getByText(
        'Filled from Reorder points: 230 brings it back to its reorder point, 96.',
      ),
    ).toBeInTheDocument();
    expect(within(dialog).getByLabelText(/Quantity to make/)).toHaveValue(
      '230',
    );
    expect(asked).toHaveLength(1);

    await userEvent.click(within(dialog).getByLabelText(/Made at/));
    await userEvent.click(
      await screen.findByRole('option', { name: /Main Site/ }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Plan run' }),
    );

    // In draft at once: the list, and its counts, read again.
    await expect.poll(() => asked.length).toBe(2);
  });

  it('offers no Plan a run to whoever may not plan one', async () => {
    open(['stock.view', 'orders.create']);

    await screen.findByRole('row', { name: /SLEEP-60CT/ });
    expect(
      screen.queryByRole('button', { name: /^Plan a run of/ }),
    ).not.toBeInTheDocument();
  });
});
