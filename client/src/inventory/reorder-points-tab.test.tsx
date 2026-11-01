import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ReorderPointDetail, ReorderPointRow } from '../api/types.gen';
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

function open(
  permissions: string[],
  address = '/inventory?tab=reorder-points',
) {
  const asked: URL[] = [];
  server.use(
    http.get('/api/v1/stock/reorder-points', ({ request }) => {
      asked.push(new URL(request.url));
      return HttpResponse.json({ entries: ROWS, nextCursor: null });
    }),
    http.get('/api/v1/stock/reorder-points/counts', () =>
      HttpResponse.json({ all: 4, low: 3, out: 0 }),
    ),
    http.get('/api/v1/stock/reorder-points/:variantId', () =>
      HttpResponse.json(DETAIL),
    ),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <InventoryPage />
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
});
