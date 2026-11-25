import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useNavigate } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  NeedsCostEntry,
  StockValuationPage,
  StockValuationTotals,
  ValuationPool,
} from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { StockValuePage } from './stock-value-page';

/** A delivery with no price, the row Set cost is for (ADR-048). */
const RECEIPT: NeedsCostEntry = {
  id: 'valuation-1',
  kind: 'movement',
  reason: 'receipt',
  reasonDetail: null,
  sku: 'EXTRACT',
  variantId: 'variant-1',
  productId: 'product-1',
  productName: 'Extract',
  variantName: null,
  type: 'material',
  coverFileId: null,
  lotId: 'lot-a',
  lotCode: 'LOT-A',
  fromLotId: null,
  fromLotCode: null,
  quantity: '40.0000',
  unitPrice: null,
  currency: null,
  referenceType: null,
  referenceId: null,
  takesCost: true,
  createdAt: '2026-11-20T17:00:00.000Z',
};

const VALUATION: StockValuationPage = { entries: [], nextCursor: null };

const TOTALS: StockValuationTotals = {
  currency: 'CAD',
  total: '120.000000',
  provisional: true,
  pools: 0,
  count: 0,
};

/** The page with these rows waiting, for a reader who may set costs. */
async function waitingRows(entries: NeedsCostEntry[]) {
  server.use(
    http.get('/api/v1/costs/valuation', () => HttpResponse.json(VALUATION)),
    http.get('/api/v1/costs/valuation/totals', () => HttpResponse.json(TOTALS)),
    http.get('/api/v1/costs/needs-cost', () =>
      HttpResponse.json({ entries, nextCursor: null }),
    ),
  );
  renderWithAuth(
    <MemoryRouter>
      <StockValuePage />
    </MemoryRouter>,
    { permissions: ['costs.view', 'costs.update'] },
  );
  const table = await screen.findByRole('table', {
    name: 'Waiting for a cost',
  });
  return within(table).getAllByRole('row').slice(1);
}

describe('StockValuePage, what waits', () => {
  // ADR-094, D5: stock moved in from another lot takes that lot's cost,
  // which follows it, so it names the lot, a link, and offers no Set cost.
  it('reads stock moved in from another lot as following that lot’s cost, the lot a link, and offers no Set cost', async () => {
    const [received, moved] = await waitingRows([
      RECEIPT,
      {
        ...RECEIPT,
        id: 'valuation-2',
        kind: 'lot_change',
        reason: 'lot_change',
        reasonDetail: 'between_lots',
        lotId: 'lot-b',
        lotCode: 'LOT-B',
        fromLotId: 'lot-a',
        fromLotCode: 'LOT-A',
        quantity: '20.0000',
        takesCost: false,
      },
    ]);

    expect(received).toHaveTextContent('Received with no price');
    expect(
      within(received).getByRole('button', { name: 'Set cost' }),
    ).toBeVisible();

    expect(moved).toHaveTextContent(
      'Moved in from lot LOT-A. Its cost follows that lot’s.',
    );
    expect(within(moved).getByRole('link', { name: 'LOT-A' })).toHaveAttribute(
      'href',
      '/lots/lot-a',
    );
    expect(
      within(moved).queryByRole('button', { name: 'Set cost' }),
    ).not.toBeInTheDocument();
  });

  // D4: a kind or a reason this tab does not know says only that it
  // waits, never "Received with no price", and is offered nothing.
  it('reads a kind or a reason it does not know as waiting for a cost, offering no Set cost', async () => {
    const rows = await waitingRows([
      {
        ...RECEIPT,
        id: 'valuation-3',
        kind: 'split_in_two' as NeedsCostEntry['kind'],
        takesCost: false,
      },
      {
        ...RECEIPT,
        id: 'valuation-4',
        reason: 'teleported',
        takesCost: false,
      },
    ]);

    for (const row of rows) {
      expect(row).toHaveTextContent('Waiting for a cost');
      expect(row).not.toHaveTextContent('Received with no price');
      expect(
        within(row).queryByRole('button', { name: 'Set cost' }),
      ).not.toBeInTheDocument();
    }
  });

  // #661 and #669's 58: which rows take a cost is the server's to say. A
  // return with no cost it shipped at takes one on its own row, which the
  // page's own copy of the rule refused; a batch's output does not.
  it('offers Set cost on the rows the server says take one, and on no other', async () => {
    const [returned, made] = await waitingRows([
      { ...RECEIPT, id: 'valuation-5', reason: 'return' },
      {
        ...RECEIPT,
        id: 'valuation-6',
        reason: 'adjustment',
        takesCost: false,
      },
    ]);

    expect(
      within(returned).getByRole('button', { name: 'Set cost' }),
    ).toBeVisible();
    expect(
      within(made).queryByRole('button', { name: 'Set cost' }),
    ).not.toBeInTheDocument();
  });
});

/** A pool of an item, one lot of it, 10 at 2.00. */
function pool(name: string): ValuationPool {
  return {
    variantId: `variant-${name}`,
    sku: `${name.toUpperCase()}-60`,
    productId: `product-${name}`,
    productName: name,
    variantName: null,
    type: 'good',
    coverFileId: null,
    lotId: `lot-${name}`,
    lotCode: `LOT-${name.toUpperCase()}`,
    lotFormerCode: null,
    quantity: '10.0000',
    value: '20.000000',
    unitCost: '2.000000',
    provisional: false,
  };
}

/** A page of pools. */
function pageOf(
  entries: ValuationPool[],
  nextCursor: string | null = null,
): StockValuationPage {
  return { entries, nextCursor };
}

/**
 * Stock value's pools answered by `answer`, nothing waiting, and their
 * totals: every pool's 999.00 and provisional, of 2 pools, `count` of
 * them matching the find. Each query asked for kept, in order, the
 * pages' and the totals' apart.
 */
function poolsRead(
  answer: (query: URLSearchParams) => StockValuationPage,
  count: (search: string) => number,
) {
  const asked: string[] = [];
  const totalsAsked: string[] = [];
  server.use(
    http.get('/api/v1/costs/valuation', ({ request }) => {
      const query = new URL(request.url).searchParams;
      asked.push(query.toString());
      return HttpResponse.json(answer(query));
    }),
    http.get('/api/v1/costs/valuation/totals', ({ request }) => {
      const query = new URL(request.url).searchParams;
      totalsAsked.push(query.toString());
      return HttpResponse.json({
        ...TOTALS,
        total: '999.000000',
        pools: 2,
        count: count(query.get('search') ?? ''),
      });
    }),
    http.get('/api/v1/costs/needs-cost', () =>
      HttpResponse.json({ entries: [], nextCursor: null }),
    ),
  );
  return { asked, totalsAsked };
}

/** A lot's page as a row's link lands there, with Back. */
function Landed() {
  const navigate = useNavigate();
  return (
    <button type="button" onClick={() => void navigate(-1)}>
      Back
    </button>
  );
}

function renderAt(address: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <Routes>
        <Route path="/costs" element={<StockValuePage />} />
        <Route path="/lots/:id" element={<Landed />} />
      </Routes>
    </MemoryRouter>,
    { permissions: ['costs.view'] },
  );
}

/** The pools' rows, each by its item's name. */
const poolNames = () =>
  within(screen.getByRole('table', { name: 'By item and lot' }))
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('/items/'))
    .map((link) => link.textContent);

/** The total, every pool's, as the page shows it. */
const total = () => screen.getByText('CA$999.00');

// ADR-094's amendment, R6: the pools fifty at a time, found and sorted by
// the server, the total every pool's whatever is read or found.
describe('StockValuePage, by item and lot', () => {
  // #296: the name first, a link to its item, its code grey under it.
  it('names each pool by its item, a link, with its code, and its lot a link', async () => {
    poolsRead(
      () => pageOf([pool('Calm')]),
      () => 1,
    );
    renderAt('/costs');

    const table = await screen.findByRole('table', {
      name: 'By item and lot',
    });
    const [row] = within(table).getAllByRole('row').slice(1);
    expect(within(row).getByRole('link', { name: 'Calm' })).toHaveAttribute(
      'href',
      '/items/product-Calm',
    );
    expect(row).toHaveTextContent('CALM-60');
    expect(within(row).getByRole('link', { name: 'LOT-CALM' })).toHaveAttribute(
      'href',
      '/lots/lot-Calm',
    );
    // #638: how many, once every one is shown, and no Show 50 more.
    expect(screen.getByText('1 item or lot')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Show 50 more' }),
    ).not.toBeInTheDocument();
  });

  // ADR-094 amended, R9, 5a: a corrected lot's latest former code, one
  // grey line under its code, as Stock by lot has it.
  it('says a corrected lot’s latest former code under its code, and nothing for a lot never corrected', async () => {
    poolsRead(
      () =>
        pageOf([
          { ...pool('Ash'), lotCode: 'ASH-0601', lotFormerCode: 'ASH-06O1' },
          pool('Calm'),
        ]),
      () => 2,
    );
    renderAt('/costs');

    const table = await screen.findByRole('table', {
      name: 'By item and lot',
    });
    const [ash, calm] = within(table).getAllByRole('row').slice(1);
    expect(
      within(ash).getByRole('link', { name: 'ASH-0601' }).closest('td'),
    ).toHaveTextContent(/^ASH-0601was ASH-06O1$/);
    expect(calm).not.toHaveTextContent('was');
  });

  // Show 50 more: the next page below, focus on its first row; failing,
  // the rows shown stay, with a line saying so and Try again (#544); the
  // total stays the whole's throughout, its read never asked again.
  it('shows fifty more below with focus on the first new row, keeping the rows when that fails, the total the whole’s and read once', async () => {
    const user = userEvent.setup();
    let fail = true;
    const { asked, totalsAsked } = poolsRead(
      (query) =>
        query.get('cursor')
          ? pageOf([pool('Focus')])
          : pageOf([pool('Calm')], 'next'),
      () => 2,
    );
    server.use(
      http.get('/api/v1/costs/valuation', ({ request }) => {
        const query = new URL(request.url).searchParams;
        if (!query.get('cursor') || !fail) return undefined;
        asked.push(query.toString());
        return HttpResponse.json(
          { message: 'Something went wrong' },
          { status: 500 },
        );
      }),
    );
    renderAt('/costs');
    await screen.findByRole('link', { name: 'Calm' });
    expect(screen.getByText('Showing 1 of 2 items and lots')).toBeVisible();
    expect(total()).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(
      await screen.findByText('The next 50 could not be loaded.'),
    ).toBeVisible();
    expect(poolNames()).toEqual(['Calm']);

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const added = await screen.findByRole('link', { name: 'Focus' });
    await waitFor(() => expect(added).toHaveFocus());
    expect(poolNames()).toEqual(['Calm', 'Focus']);
    expect(screen.getByText('2 items and lots')).toBeVisible();
    expect(total()).toBeVisible();
    expect(asked).toEqual([
      'limit=50',
      'limit=50&cursor=next',
      'limit=50&cursor=next',
    ]);
    expect(totalsAsked).toEqual(['']);
  });

  // #473: Back from a lot reads the pages shown again, and focus is on
  // the row left from, its lot's link.
  it('finds the rows shown and the row left from on Back from a lot after Show 50 more', async () => {
    const user = userEvent.setup();
    const { asked } = poolsRead(
      (query) =>
        query.get('cursor')
          ? pageOf([pool('Focus')])
          : pageOf([pool('Calm')], 'next'),
      () => 2,
    );
    renderAt('/costs');
    await screen.findByRole('link', { name: 'Calm' });
    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    await user.click(await screen.findByRole('link', { name: 'LOT-FOCUS' }));
    asked.length = 0;

    await user.click(await screen.findByRole('button', { name: 'Back' }));
    const left = await screen.findByRole('link', { name: 'LOT-FOCUS' });
    await waitFor(() => expect(left).toHaveFocus());
    expect(poolNames()).toEqual(['Calm', 'Focus']);
    // The first page, then the next by its cursor, before the rows show.
    expect(asked).toEqual(['limit=50', 'limit=50&cursor=next']);
  });

  // The interaction table's find: what is typed is asked for, the find
  // in the address; how many it matches of every pool beside it, from
  // the totals' read for the find; nothing matching says so, with Clear
  // the search; the total stays the whole's.
  it('finds what is typed, how many match beside it, says when nothing matches with Clear the search, the total as it was', async () => {
    const user = userEvent.setup();
    const matching = { zzz: 0, calm: 1 } as Record<string, number>;
    const { asked, totalsAsked } = poolsRead(
      (query) =>
        query.get('search') === 'zzz'
          ? pageOf([])
          : query.get('search') === 'calm'
            ? pageOf([pool('Calm')])
            : pageOf([pool('Calm'), pool('Focus')]),
      (search) => matching[search] ?? 2,
    );
    renderAt('/costs?search=zzz');

    expect(await screen.findByText('Nothing matches “zzz”.')).toBeVisible();
    expect(screen.getByRole('status')).toHaveTextContent('0 of 2 match');
    expect(total()).toBeVisible();
    expect(asked).toEqual(['limit=50&search=zzz']);

    await user.click(screen.getByRole('button', { name: 'Clear the search' }));
    await screen.findByRole('link', { name: 'Focus' });
    expect(poolNames()).toEqual(['Calm', 'Focus']);
    expect(
      screen.getByRole('searchbox', { name: 'Find an item or a lot' }),
    ).toHaveValue('');
    expect(screen.queryByText(/ match$/)).not.toBeInTheDocument();

    await user.type(
      screen.getByRole('searchbox', { name: 'Find an item or a lot' }),
      'calm',
    );
    await expect.poll(() => asked.at(-1)).toBe('limit=50&search=calm');
    await waitFor(() => expect(poolNames()).toEqual(['Calm']));
    expect(await screen.findByText('1 of 2 match')).toBeVisible();
    expect(screen.getByText('1 item or lot')).toBeVisible();
    expect(total()).toBeVisible();
    // The totals once a find, as the find asks the list.
    expect(totalsAsked).toEqual(['search=zzz', '', 'search=calm']);
  });

  // The interaction table's sort: the Value header puts the largest
  // first, again the smallest; the Item header puts the item's order
  // back, the list's own; each in the address, the header keeping focus.
  it('sorts by value, the largest first and again the smallest, and back by the item', async () => {
    const user = userEvent.setup();
    const { asked, totalsAsked } = poolsRead(
      () => pageOf([pool('Calm')]),
      () => 1,
    );
    renderAt('/costs');
    await screen.findByRole('link', { name: 'Calm' });
    const header = (name: string) =>
      within(screen.getByRole('table', { name: 'By item and lot' })).getByRole(
        'columnheader',
        { name },
      );
    expect(header('Item')).toHaveAttribute('aria-sort', 'ascending');
    expect(header('Value')).not.toHaveAttribute('aria-sort');

    await user.click(screen.getByRole('button', { name: 'Value' }));
    await expect.poll(() => asked.at(-1)).toBe('limit=50&sort=-value');
    await waitFor(() =>
      expect(header('Value')).toHaveAttribute('aria-sort', 'descending'),
    );
    expect(header('Item')).not.toHaveAttribute('aria-sort');
    expect(screen.getByRole('button', { name: 'Value' })).toHaveFocus();

    await user.click(screen.getByRole('button', { name: 'Value' }));
    await expect.poll(() => asked.at(-1)).toBe('limit=50&sort=value');
    await waitFor(() =>
      expect(header('Value')).toHaveAttribute('aria-sort', 'ascending'),
    );

    await user.click(screen.getByRole('button', { name: 'Item' }));
    await expect.poll(() => asked.at(-1)).toBe('limit=50');
    await waitFor(() =>
      expect(header('Item')).toHaveAttribute('aria-sort', 'ascending'),
    );
    expect(header('Value')).not.toHaveAttribute('aria-sort');
    // The total kept through each sort, its read never asked again.
    expect(total()).toBeVisible();
    expect(totalsAsked).toEqual(['']);
  });

  // After Set cost, the totals are read again with the pools' first
  // page, so the total says what the cost changed.
  it('reads the totals again with the first page after Set cost', async () => {
    const user = userEvent.setup();
    let costed = false;
    const { asked, totalsAsked } = poolsRead(
      () => pageOf([pool('Calm')]),
      () => 1,
    );
    server.use(
      http.get('/api/v1/costs/needs-cost', () =>
        HttpResponse.json({
          entries: costed ? [] : [RECEIPT],
          nextCursor: null,
        }),
      ),
      http.get('/api/v1/costs/valuation/totals', () => {
        totalsAsked.push('');
        return HttpResponse.json({
          ...TOTALS,
          total: costed ? '1019.000000' : '999.000000',
          pools: 1,
          count: 1,
        });
      }),
      http.put('/api/v1/costs/valuations/valuation-1', () => {
        costed = true;
        return HttpResponse.json({
          cost: {
            valuationId: 'valuation-1',
            value: '20.000000',
            held: '20.000000',
            issued: '0.000000',
            followed: [],
          },
        });
      }),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/costs']}>
        <Routes>
          <Route path="/costs" element={<StockValuePage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['costs.view', 'costs.update'] },
    );
    expect(await screen.findByText('CA$999.00')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Set cost' }));
    const dialog = await screen.findByRole('dialog');
    await user.type(
      within(dialog).getByRole('textbox', { name: 'Unit price' }),
      '0.50',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Set cost' }));

    expect(await screen.findByText('CA$1,019.00')).toBeVisible();
    expect(totalsAsked).toEqual(['', '']);
    expect(asked).toEqual(['limit=50', 'limit=50']);
  });

  // Three languages: the find's words and how many, in Chinese.
  it('says how many and that nothing matches in Chinese', async () => {
    localStorage.setItem('language', 'zh-Hans');
    try {
      poolsRead(
        (query) =>
          query.get('search') ? pageOf([]) : pageOf([pool('Calm')], 'next'),
        (search) => (search ? 0 : 2),
      );
      const { unmount } = renderAt('/costs');
      expect(
        await screen.findByText('已显示 1 个，共 2 个物品和批次', undefined, {
          timeout: 3000,
        }),
      ).toBeVisible();
      expect(
        screen.getByRole('searchbox', { name: '查找物品或批次' }),
      ).toBeVisible();
      unmount();

      renderAt('/costs?search=zzz');
      expect(await screen.findByText('没有与“zzz”匹配的结果。')).toBeVisible();
      expect(
        await screen.findByText('匹配 0 个，共 2 个物品和批次'),
      ).toBeVisible();
      expect(screen.getByRole('button', { name: '清除搜索' })).toBeVisible();
    } finally {
      localStorage.removeItem('language');
    }
  });
});
