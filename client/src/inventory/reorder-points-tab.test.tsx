import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { type ReactNode, useRef } from 'react';
import {
  MemoryRouter,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ReorderPointDetail, ReorderPointRow } from '../api/types.gen';
import { HelpFrame } from '../help/help-panel';
import { HelpProvider } from '../help/help-provider';
import { orderFillOf } from '../orders/order-fill';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { InventoryPage } from './inventory-page';

function point(over: Partial<ReorderPointRow>): ReorderPointRow {
  return {
    id: `point-${over.sku}`,
    variantId: `variant-${over.sku}`,
    productId: `product-${over.sku}`,
    type: 'good',
    coverFileId: null,
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
    productName: 'Omega 3',
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
    productName: 'Sleep',
    source: 'made',
    rule: 'just_enough',
    fixedQuantity: null,
    suggestion: '230.0000',
    suggestedMultiples: null,
  }),
  point({
    sku: 'BOTTLE-90',
    productName: 'Amber bottle',
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
    },
  ],
  expired: '6.0000',
  issued: '0.0000',
  coming: [],
  stillNeeded: [],
};

/** Where a row's name and its line go: the item's page, at its part. */
/** An item's page as a row's link lands there, with Back. */
function Landed() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Back
    </button>
  );
}

function ItemPage() {
  const { pathname, hash } = useLocation();
  return (
    <p>
      Item page: {pathname}
      {hash}
    </p>
  );
}

/** Where Buy goes: what it fills New order with. */
function NewOrder() {
  const { state } = useLocation();
  return <p>New order: {JSON.stringify(orderFillOf(state))}</p>;
}

/** Inventory inside Help's frame, so a Learn more opens the guide. */
function WithHelp({ children }: { children: ReactNode }) {
  const bar = useRef<HTMLElement>(null);
  return (
    <HelpProvider>
      <header ref={bar} />
      <HelpFrame bar={bar}>{children}</HelpFrame>
    </HelpProvider>
  );
}

function open(
  permissions: string[],
  address = '/inventory?tab=reorder',
  { rows = ROWS, counts = { all: 4, low: 3, out: 0 }, help = false } = {},
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
        <Route
          path="/inventory"
          element={
            help ? (
              <WithHelp>
                <InventoryPage />
              </WithHelp>
            ) : (
              <InventoryPage />
            )
          }
        />
        <Route path="/orders/new" element={<NewOrder />} />
        <Route path="/items/:id" element={<ItemPage />} />
      </Routes>
    </MemoryRouter>,
    { permissions },
  );
  return asked;
}

describe('Reorder', () => {
  it('gives a box only to a bought low item with something to order, a drafted one disabled with its reason beside it', async () => {
    open(['stock.view', 'orders.create', 'orders.view']);

    expect(
      await screen.findByRole('checkbox', { name: 'Choose Vitamin D3' }),
    ).toBeEnabled();
    const drafted = screen.getByRole('row', { name: /OMEGA3-90/ });
    expect(
      within(drafted).getByRole('checkbox', { name: 'Choose Omega 3' }),
    ).toBeDisabled();
    // Its reason on screen, not only in a hover a phone never has (#459).
    expect(within(drafted).getByText('In a draft already')).toBeVisible();
    // Made, or with enough: nothing to buy.
    expect(
      screen.queryByRole('checkbox', { name: /Sleep|Amber bottle/ }),
    ).not.toBeInTheDocument();
    // The draft and its quantity in their own cell, the order a link.
    expect(drafted).toHaveTextContent('Drafted in PO-DEMO-13 · 120');
    expect(
      within(drafted).getAllByRole('link', { name: 'PO-DEMO-13' })[0],
    ).toHaveAttribute('href', '/orders/po-13');
    // A fixed rule's suggestion with its unit, in its multiples.
    const fixed = screen.getByRole('row', { name: /D3-1000/ });
    expect(within(fixed).getByText('96 each')).toBeInTheDocument();
    expect(within(fixed).getByText('2 × 48')).toBeInTheDocument();
  });

  it('names each row first, its code grey with how it is got in words, and links where it stands', async () => {
    open(['stock.view']);

    const row = await screen.findByRole('row', { name: /D3-1000/ });
    expect(
      within(row).getByRole('link', { name: 'Vitamin D3' }),
    ).toHaveAttribute('href', '/items/product-D3-1000');
    expect(
      within(row).getByText('Bought · in multiples of 48'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /SLEEP-60CT/ })).getByText(
        'Made · makes what is short',
      ),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('row', { name: /OMEGA3-90/ })).getByText(
        'Bought · orders what is short',
      ),
    ).toBeInTheDocument();

    await userEvent.click(
      within(row).getByRole('link', { name: '20 left · reorder at 96' }),
    );
    expect(
      await screen.findByText('Item page: /items/product-D3-1000#stock'),
    ).toBeInTheDocument();
  });

  // The name is the row's one way in (ADR-093 v3): a click elsewhere on
  // the row, or on its buttons, opens nothing.
  it('opens the item’s page from its name alone, not from elsewhere on a row', async () => {
    open(['stock.view']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Where D3-1000 stands' }),
    );
    await userEvent.click(
      within(screen.getByRole('row', { name: /SLEEP-60CT/ })).getByText('Low'),
    );
    expect(screen.queryByText(/^Item page/)).not.toBeInTheDocument();

    await userEvent.click(
      within(screen.getByRole('row', { name: /SLEEP-60CT/ })).getAllByRole(
        'link',
      )[0]!,
    );
    expect(
      await screen.findByText('Item page: /items/product-SLEEP-60CT'),
    ).toBeInTheDocument();
  });

  it('says the line above the table, and names the bar’s colours and its mark', async () => {
    open(['stock.view', 'orders.create']);

    expect(
      await screen.findByText(
        /^Buy or make what is short\. Tick several to buy them on one purchase order\./,
      ),
    ).toBeInTheDocument();
    await screen.findByText('the reorder point, always in the middle');
    for (const words of [
      'Low',
      'Enough',
      'Out',
      'the reorder point, always in the middle',
    ]) {
      expect(screen.getAllByText(words).length).toBeGreaterThan(0);
    }
  });

  it('buys one row from its own button, New order filled in with it', async () => {
    open(['stock.view', 'orders.create']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Buy 96 of Vitamin D3' }),
    );

    expect(
      await screen.findByText(
        `New order: ${JSON.stringify({
          lines: [{ variantId: 'variant-D3-1000', quantity: '96.0000' }],
        })}`,
      ),
    ).toBeInTheDocument();
  });

  // ADR-093, R7 (A5): what to order most of first, unless another order
  // is chosen; Status puts the list's own order back, Low first.
  it('opens sorted by the suggested order, most first; its header turns it, and Status puts Low first', async () => {
    const asked = open(['stock.view']);

    const header = await screen.findByRole('columnheader', {
      name: /Suggested order/,
    });
    expect(header).toHaveAttribute('aria-sort', 'descending');
    // Sorted, its arrow solid; Status's faint at rest (Bob's third
    // message, 4).
    expect(within(header).getByTestId('ArrowDownwardIcon')).toBeInTheDocument();
    expect(
      within(screen.getByRole('columnheader', { name: /Status/ })).getByTestId(
        'UnfoldMoreIcon',
      ),
    ).toBeInTheDocument();
    expect(asked[0].searchParams.get('sort')).toBe('suggested');
    expect(asked[0].searchParams.get('order')).toBe('desc');

    await userEvent.click(
      screen.getByRole('button', { name: 'Suggested order' }),
    );
    await expect
      .poll(() => asked.at(-1)?.searchParams.get('order'))
      .toBe('asc');

    await userEvent.click(screen.getByRole('button', { name: 'Status' }));
    await expect.poll(() => asked.at(-1)?.searchParams.has('sort')).toBe(false);
    expect(
      screen.getByRole('columnheader', { name: /Status/ }),
    ).toHaveAttribute('aria-sort', 'ascending');
  });

  // Reorder was Reorder points (ADR-093): a kept address still opens it.
  it('opens from the old address, on its filter', async () => {
    const asked = open(
      ['stock.view'],
      '/inventory?tab=reorder-points&status=low',
    );

    expect(
      await screen.findByRole('tab', { name: 'Reorder', selected: true }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('button', {
        name: /^Low stock\s*3$/,
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(asked[0].searchParams.get('status')).toBe('low');
  });

  it('shows what is chosen in the bar until it is cleared, and the header’s box chooses every row it can', async () => {
    open(['stock.view', 'orders.create']);

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Choose Vitamin D3' }),
    );
    const bar = screen.getByRole('region', { name: 'Chosen to order' });
    expect(within(bar).getByText('1 chosen')).toBeInTheDocument();
    expect(within(bar).getByText('Vitamin D3 · 96')).toBeInTheDocument();
    // Said to a screen reader too, from a status there before the bar.
    expect(screen.getByRole('status')).toHaveTextContent('1 chosen');
    // Its focus ring in the bar's own text colour, not the faint accent.
    const clear = within(bar).getByRole('button', { name: 'Clear' });
    clear.classList.add('Mui-focusVisible');
    expect(getComputedStyle(clear).outlineColor).toBe(
      getComputedStyle(bar).color,
    );
    clear.classList.remove('Mui-focusVisible');

    await userEvent.click(within(bar).getByRole('button', { name: 'Clear' }));
    expect(
      screen.queryByRole('region', { name: 'Chosen to order' }),
    ).not.toBeInTheDocument();

    await userEvent.click(
      screen.getByRole('checkbox', { name: 'Choose every item to order' }),
    );
    expect(
      screen.getByRole('checkbox', { name: 'Choose Vitamin D3' }),
    ).toBeChecked();
    expect(
      within(screen.getByRole('region', { name: 'Chosen to order' })).getByText(
        '1 chosen',
      ),
    ).toBeInTheDocument();
  });

  // What is in draft is the row's own: the opened row shows it from there.
  it('shows an opened row’s drafts from the row', async () => {
    open(['stock.view', 'orders.view']);

    await userEvent.click(
      await screen.findByRole('button', { name: 'Where OMEGA3-90 stands' }),
    );

    // The column's header, and the opened row's own part.
    await waitFor(() =>
      expect(screen.getAllByText('In draft')).toHaveLength(2),
    );
    expect(screen.getAllByText('PO-DEMO-13').length).toBeGreaterThan(1);
  });

  // A quick read shows no skeleton (conventions, Loading states).
  it('opens a row with no skeleton until the read takes a while', async () => {
    open(['stock.view']);
    server.use(
      http.get('/api/v1/stock/reorder-points/:variantId', async () => {
        await delay(400);
        return HttpResponse.json(DETAIL);
      }),
    );

    await userEvent.click(
      await screen.findByRole('button', { name: 'Where D3-1000 stands' }),
    );

    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.MuiSkeleton-root')).not.toBeNull(),
    );
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
    const actions = await screen.findByRole('button', {
      name: 'Actions for Vitamin D3',
    });
    // Says it opens a menu, and whether it is open.
    expect(actions).toHaveAttribute('aria-haspopup', 'menu');
    expect(actions).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(actions);
    const menu = await screen.findByRole('menu');
    expect(actions).toHaveAttribute('aria-expanded', 'true');
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
    // Nothing to filter, work out or export yet.
    expect(screen.queryByRole('button', { name: /^All/ })).toBeNull();
    expect(screen.queryByText(/^Buy or make what is short/)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Export' })).toBeNull();
  });

  it('says nothing is low, with how many have a point, and shows all', async () => {
    const asked = open(['stock.view'], '/inventory?tab=reorder&status=low', {
      rows: [],
      counts: { all: 9, low: 0, out: 0 },
    });

    expect(
      await screen.findByText('Nothing is low. 9 items have a reorder point.'),
    ).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Show all' }));

    expect(
      await screen.findByRole('button', { name: /^All\s*9$/, pressed: true }),
    ).toBeInTheDocument();
    expect(asked.at(-1)?.searchParams.has('status')).toBe(false);
  });

  // Review 71: Show 50 more, as every list says it; a next page that
  // fails keeps the rows shown, with a line saying so and Try again.
  it('shows fifty more, and keeps the rows when the next page fails', async () => {
    const user = userEvent.setup();
    open(['stock.view']);
    server.use(
      http.get('/api/v1/stock/reorder-points', ({ request }) =>
        new URL(request.url).searchParams.get('before')
          ? HttpResponse.json(
              { message: 'Something went wrong' },
              { status: 500 },
            )
          : HttpResponse.json({ entries: ROWS, nextCursor: 'next' }),
      ),
    );

    // How many of the view's it shows (Bob's third message, 5).
    expect(
      await screen.findByText(`Showing ${ROWS.length} of 4 codes`),
    ).toBeVisible();
    await user.click(
      await screen.findByRole('button', { name: 'Show 50 more' }),
    );
    expect(
      await screen.findByText('The next 50 could not be loaded.'),
    ).toBeVisible();
    expect(
      screen.getAllByRole('link', { name: ROWS[0]!.productName }).length,
    ).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Try again' })).toBeVisible();
  });

  // #638 (P1a) and #473's last line (P2a): the count always, and Back
  // after Show 50 more finds the rows shown, focus on the row left from.
  it('counts its codes once every one is shown, and Back after Show 50 more finds them', async () => {
    const user = userEvent.setup();
    const later = point({ sku: 'ZINC-60', productName: 'Zinc' });
    server.use(
      http.get('/api/v1/stock/reorder-points', ({ request }) =>
        new URL(request.url).searchParams.get('before')
          ? HttpResponse.json({ entries: [later], nextCursor: null })
          : HttpResponse.json({ entries: [ROWS[0]], nextCursor: 'next' }),
      ),
      http.get('/api/v1/stock/reorder-points/counts', () =>
        HttpResponse.json({ all: 2, low: 2, out: 0 }),
      ),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/inventory?tab=reorder']}>
        <Routes>
          <Route path="/inventory" element={<InventoryPage />} />
          <Route path="/items/:id" element={<Landed />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['stock.view'] },
    );

    expect(await screen.findByText('Showing 1 of 2 codes')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(await screen.findByText('2 codes')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Show 50 more' }),
    ).not.toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Zinc' }));

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    const left = await screen.findByRole('link', { name: 'Zinc' });
    await waitFor(() => expect(left).toHaveFocus());
    expect(screen.getByText('2 codes')).toBeVisible();
  });

  // Points de commande are masculine: Tous, not Invoices' Toutes.
  it('says All in French as its own word', async () => {
    localStorage.setItem('language', 'fr-CA');
    try {
      open(['stock.view']);

      expect(
        await screen.findByRole('button', { name: /^Tous\s*4$/ }),
      ).toBeInTheDocument();
    } finally {
      localStorage.removeItem('language');
    }
  });

  it('opens on Low from the address, with the counts beside each view', async () => {
    const asked = open(['stock.view'], '/inventory?tab=reorder&status=low');

    expect(
      await screen.findByRole('button', {
        name: /^Low stock\s*3$/,
        pressed: true,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /^All\s*4$/ }),
    ).toBeInTheDocument();
    expect(asked[0].searchParams.get('status')).toBe('low');
  });

  it('raises a purchase order of what is chosen, each at its suggestion', async () => {
    open(['stock.view', 'orders.create']);

    await userEvent.click(
      await screen.findByRole('checkbox', { name: 'Choose Vitamin D3' }),
    );
    await userEvent.click(
      within(screen.getByRole('region', { name: 'Chosen to order' })).getByRole(
        'button',
        { name: 'Buy 1 item on a purchase order' },
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

  it('offers Make on a made low row to whoever may plan a run, filled in, and reads the list again once planned', async () => {
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
    expect(screen.getAllByRole('button', { name: /^Make / })).toHaveLength(1);

    await userEvent.click(
      screen.getByRole('button', { name: 'Make 230 of Sleep' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'Plan a run' });
    expect(
      within(dialog).getByText(
        'Filled from Reorder: 230 brings it back to its reorder point, 96.',
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
    // Read again once planned: SLEEP-60CT in draft.
    server.use(
      http.get('/api/v1/stock/reorder-points', ({ request }) => {
        asked.push(new URL(request.url));
        return HttpResponse.json({
          entries: ROWS.map((row) =>
            row.sku === 'SLEEP-60CT'
              ? {
                  ...row,
                  suggestion: '0.0000',
                  drafted: true,
                  inDraft: '230.0000',
                  drafts: [
                    {
                      kind: 'run',
                      id: 'run-1',
                      number: 'MO-000001',
                      quantity: '230.0000',
                    },
                  ],
                }
              : row,
          ),
          nextCursor: null,
        });
      }),
    );
    await userEvent.click(
      within(dialog).getByRole('button', { name: 'Plan run' }),
    );

    // In draft at once: the list, and its counts, read again.
    await expect.poll(() => asked.length).toBe(2);
    // Its Plan a run gone, focus goes to its draft, not the page's start.
    await waitFor(() =>
      expect(document.activeElement).toHaveTextContent(/^Drafted/),
    );
    expect(screen.getByRole('row', { name: /SLEEP-60CT/ })).toContainElement(
      document.activeElement as HTMLElement,
    );
  });

  it('opens Help at where an item stands, from the line that says it', async () => {
    open(['stock.view'], undefined, { help: true });

    const line = await screen.findByText(/^Buy or make what is short\./);
    await userEvent.click(
      within(line).getByRole('button', { name: 'Learn more' }),
    );

    const help = screen.getByRole('complementary', { name: 'Help' });
    expect(
      await within(help).findByRole('heading', {
        level: 3,
        name: 'Where an item stands',
      }),
    ).toBeInTheDocument();
  });

  it('opens Help at reorder points from the list with none, a Viewer’s too', async () => {
    open(['stock.view'], undefined, {
      rows: [],
      counts: { all: 0, low: 0, out: 0 },
      help: true,
    });

    const empty = (await screen.findByText('No reorder points yet.')).closest(
      'div',
    );
    expect(empty).not.toBeNull();
    // One Learn more, the empty state's: the position's line is not shown.
    expect(screen.getAllByRole('button', { name: 'Learn more' })).toHaveLength(
      1,
    );
    await userEvent.click(
      within(empty!).getByRole('button', { name: 'Learn more' }),
    );

    const help = screen.getByRole('complementary', { name: 'Help' });
    expect(
      await within(help).findByRole('heading', {
        level: 3,
        name: 'Reorder points',
      }),
    ).toBeInTheDocument();
  });

  it('offers no Make to whoever may not plan a run', async () => {
    open(['stock.view', 'orders.create']);

    await screen.findByRole('row', { name: /SLEEP-60CT/ });
    expect(
      screen.queryByRole('button', { name: /^Make / }),
    ).not.toBeInTheDocument();
  });
});
