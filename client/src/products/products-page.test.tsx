import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
} from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  ChangeProductsDto,
  ProductChange,
  ProductCounts,
  ProductPage,
  ProductSummary,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { LicencesPage } from '../licences/licences-page';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductsPage } from './products-page';

function product(name: string): ProductSummary {
  return {
    id: name,
    type: 'good',
    displayName: name,
    sku: name.toUpperCase(),
    variantCount: 1,
    category: null,
    coverFileId: null,
    isActive: true,
    createdAt: '2026-11-09T12:00:00.000Z',
    updatedAt: '2026-11-09T12:00:00.000Z',
    onHand: '0.0000',
    unitOfMeasure: 'each',
    stockStatus: null,
  };
}

/** The list's first page (ADR-092), holding these rows. */
function pageOf(
  rows: ProductSummary[],
  counts: ProductCounts | null = null,
  nextCursor: string | null = null,
): ProductPage {
  return { entries: rows, nextCursor, counts };
}

/** Each tab's count, as the server sends them with a first page. */
function countsOf(
  types: Partial<Record<ProductSummary['type'], number>>,
  discontinued = 0,
): ProductCounts {
  const entries = Object.entries(types) as [ProductSummary['type'], number][];
  return {
    types: entries.map(([type, count]) => ({ type, count })),
    all: entries.reduce((sum, [, count]) => sum + count, 0),
    discontinued,
  };
}

function renderAt(address: string) {
  return renderWithAuth(
    <MemoryRouter initialEntries={[address]}>
      <ProductsPage />
    </MemoryRouter>,
    { permissions: ['products.view'] },
  );
}

/** The rows' names, in order: each row's link to its item. */
const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('link')
    .filter((link) => link.getAttribute('href')?.startsWith('/items/'))
    .map((link) => link.textContent);

/**
 * Searched on the server (ADR-056, amended): the page sends what is typed
 * and shows what comes back, in the order it comes, matching nothing
 * itself.
 */
describe('ProductsPage', () => {
  // What every render reads beside the list: the category tree, and whom
  // to ask, for a reader who cannot add.
  beforeEach(() => {
    server.use(
      http.get('/api/v1/products/categories', () =>
        HttpResponse.json({ categories: [] }),
      ),
      http.get('/api/v1/account/membership', () =>
        HttpResponse.json({
          roles: [{ name: 'Viewer', description: null }],
          holdsEverything: false,
          whomToAsk: [],
        }),
      ),
    );
  });

  it('asks with the address’s search, and lists the answer in its order', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('search'));
        // Best match first, not by name, and not containing the query:
        // the server found it by its pinyin.
        return HttpResponse.json(
          pageOf([product('专注胶囊 60 粒'), product('Calm 90ct')]),
        );
      }),
    );

    renderAt('/items?search=zzjn');

    expect(
      await screen.findByRole('link', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(asked).toEqual(['zzjn']);
    expect(
      screen.getByRole('searchbox', { name: 'Search by name or code' }),
    ).toHaveValue('zzjn');
    expect(names()).toEqual(['专注胶囊 60 粒', 'Calm 90ct']);
  });

  it('asks again once typing stops, and drops an answer that comes after a newer one', async () => {
    const user = userEvent.setup();
    let answerFirst: () => void = () => undefined;
    const firstAnswered = new Promise<void>((resolve) => {
      answerFirst = resolve;
    });
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', async ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        asked.push(search);
        if (search === 'fo') {
          await firstAnswered;
          return HttpResponse.json(pageOf([product('Fog lamp')]));
        }
        return HttpResponse.json(
          pageOf([product(search === 'foc' ? 'Focus 60ct' : 'Calm 90ct')]),
        );
      }),
    );

    renderAt('/items');
    await screen.findByRole('link', { name: 'Calm 90ct' });

    const box = screen.getByRole('searchbox', {
      name: 'Search by name or code',
    });
    await user.type(box, 'fo');
    await expect.poll(() => asked).toEqual([null, 'fo']);
    await user.type(box, 'c');

    expect(
      await screen.findByRole('link', { name: 'Focus 60ct' }),
    ).toBeVisible();
    expect(asked).toEqual([null, 'fo', 'foc']);

    answerFirst();
    // Every chance for the late answer to land before checking it didn't.
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(names()).toEqual(['Focus 60ct']);
  });

  it('waits for a new search’s answer, rather than showing the last one’s rows', async () => {
    const user = userEvent.setup();
    let answer: () => void = () => undefined;
    const answered = new Promise<void>((resolve) => {
      answer = resolve;
    });
    server.use(
      http.get('/api/v1/products', async ({ request }) => {
        if (new URL(request.url).searchParams.get('search') === null)
          return HttpResponse.json(pageOf([product('Focus 60ct')]));
        await answered;
        return HttpResponse.json(pageOf([product('Calm 90ct')]));
      }),
    );

    renderAt('/items');
    await screen.findByRole('link', { name: 'Focus 60ct' });

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by name or code' }),
      'calm',
    );
    await waitFor(() =>
      expect(
        screen.queryByRole('link', { name: 'Focus 60ct' }),
      ).not.toBeInTheDocument(),
    );
    expect(screen.queryByText('Nothing matches that search.')).toBeNull();

    answer();
    expect(
      await screen.findByRole('link', { name: 'Calm 90ct' }),
    ).toBeVisible();
  });

  it('says no items yet for an empty catalogue, and nothing matches for an empty search', async () => {
    const user = userEvent.setup();
    const answered: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        answered.push(new URL(request.url).searchParams.get('search'));
        return HttpResponse.json(pageOf([]));
      }),
    );

    renderAt('/items');
    expect(
      await screen.findByText(
        'No items yet. Add what you sell first, or the raw materials you make it from.',
      ),
    ).toBeVisible();

    await user.type(
      screen.getByRole('searchbox', { name: 'Search by name or code' }),
      '鱼',
    );
    await expect.poll(() => answered).toEqual([null, '鱼']);
    expect(
      await screen.findByText('Nothing matches that search.'),
    ).toBeVisible();
    expect(screen.queryByText(/No items yet/)).not.toBeInTheDocument();
  });

  /**
   * The search in the address while the page stays open (#260's done
   * when): "Show all in Items" from the top bar on Items itself, then
   * Back and Forward. Every list on useListSearch does the same.
   */
  it('follows the address while open, and writes what is typed there without adding to the history', async () => {
    const user = userEvent.setup();
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        asked.push(search);
        return HttpResponse.json(
          pageOf([product(`Found by ${search ?? 'nothing'}`)]),
        );
      }),
    );
    const router = createMemoryRouter(
      [{ path: '/items', element: <ProductsPage /> }],
      { initialEntries: ['/items?search=calm'] },
    );
    renderWithAuth(<RouterProvider router={router} />, {
      permissions: ['products.view'],
    });
    const box = screen.getByRole('searchbox', {
      name: 'Search by name or code',
    });
    await screen.findByRole('link', { name: 'Found by calm' });

    // Show all, from the lookup's box, as the lookup goes there.
    await act(() => router.navigate('/items?search=zzjn'));
    expect(
      await screen.findByRole('link', { name: 'Found by zzjn' }),
    ).toBeVisible();
    expect(box).toHaveValue('zzjn');

    await act(() => router.navigate(-1));
    expect(
      await screen.findByRole('link', { name: 'Found by calm' }),
    ).toBeVisible();
    expect(box).toHaveValue('calm');

    // Written once typing stops, in place of this entry: Forward still
    // leads to the search after it, and the box keeps what was typed.
    await user.type(box, ' 90');
    expect(
      await screen.findByRole('link', { name: 'Found by calm 90' }),
    ).toBeVisible();
    expect(router.state.location.search).toBe('?search=calm+90');
    expect(box).toHaveValue('calm 90');

    await act(() => router.navigate(1));
    expect(
      await screen.findByRole('link', { name: 'Found by zzjn' }),
    ).toBeVisible();
    expect(box).toHaveValue('zzjn');
    expect(asked).toEqual(['calm', 'zzjn', 'calm', 'calm 90', 'zzjn']);
  });

  /**
   * The export writes what the list shows (ADR-057, ADR-092): its tab, its
   * search, Discontinued and its sort, every row of them.
   */
  it('exports what the list shows, its tab, search, Discontinued and sort', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:export');
    URL.revokeObjectURL = vi.fn();
    const clicked = vi
      .spyOn(HTMLAnchorElement.prototype, 'click')
      .mockImplementation(() => undefined);
    const exported: string[] = [];
    server.use(
      http.get('/api/v1/products', () =>
        HttpResponse.json(pageOf([product('Calm 90ct')])),
      ),
      http.get('/api/v1/products/export', ({ request }) => {
        exported.push(new URL(request.url).search);
        return new HttpResponse('\uFEFFCode\r\n', {
          headers: { 'Content-Type': 'text/csv; charset=utf-8' },
        });
      }),
    );

    try {
      renderAt('/items?search=calm');
      await screen.findByRole('link', { name: 'Calm 90ct' });
      await user.click(screen.getByRole('button', { name: /Discontinued/ }));
      await user.click(screen.getByRole('button', { name: 'Export' }));

      await expect
        .poll(() => exported)
        .toEqual([
          '?type=good&discontinued=only&search=calm&sort=name&order=asc',
        ]);
    } finally {
      clicked.mockRestore();
    }
  });

  // Licences reached from here, a link inside the app, offers Back (#341).
  it('opens Licences with Back to Items', async () => {
    server.use(
      http.get('/api/v1/products', () => HttpResponse.json(pageOf([]))),
      http.get('/api/v1/product-licences', () => HttpResponse.json([])),
    );
    renderWithAuth(
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route path="/items" element={<ProductsPage />} />
          <Route path="/licences" element={<LicencesPage />} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['products.view', 'product_licences.view'] },
    );

    await userEvent.click(
      await screen.findByRole('link', { name: 'Licences' }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Licences' }),
    ).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Back' }));

    expect(await screen.findByRole('link', { name: 'Licences' })).toBeVisible();
  });

  /** What the list asked for, each read's query as it came. */
  function readsOf(answer: (query: URLSearchParams) => ProductPage) {
    const asked: string[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        const query = new URL(request.url).searchParams;
        asked.push(query.toString());
        return HttpResponse.json(answer(query));
      }),
    );
    return asked;
  }

  // The interaction table's first row (ADR-092): Products, or the first
  // type the organization holds; a type with none has no tab.
  it('opens on Products, or on the first type with items, with each tab’s count', async () => {
    const asked = readsOf((query) =>
      pageOf(
        [product(`A ${query.get('type') ?? 'all'}`)],
        countsOf({ material: 46, packaging: 22 }),
      ),
    );

    renderAt('/items');

    expect(
      await screen.findByRole('link', { name: 'A material' }),
    ).toBeVisible();
    expect(asked).toEqual([
      'type=good&sort=name&order=asc',
      'type=material&sort=name&order=asc',
    ]);
    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Raw materials 46',
      'Packaging 22',
      'All 68',
    ]);
    expect(screen.getByRole('tab', { name: /Raw materials/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('reads a tab’s type when chosen, keeping the search, and writes it in the address', async () => {
    const user = userEvent.setup();
    const asked = readsOf(() =>
      pageOf([product('Calm 90ct')], countsOf({ good: 3, packaging: 1 })),
    );
    const router = createMemoryRouter(
      [{ path: '/items', element: <ProductsPage /> }],
      { initialEntries: ['/items?search=calm'] },
    );
    renderWithAuth(<RouterProvider router={router} />, {
      permissions: ['products.view'],
    });
    await screen.findByRole('link', { name: 'Calm 90ct' });

    await user.click(screen.getByRole('tab', { name: /Packaging/ }));

    await expect
      .poll(() => asked.at(-1))
      .toBe('type=packaging&search=calm&sort=name&order=asc');
    expect(router.state.location.search).toBe('?search=calm&tab=packaging');
  });

  // The top bar's Show all (ADR-056, amended): All, discontinued included,
  // a chip saying so whose × hides them again.
  it('opens Show all’s address on All with discontinued items, a chip removing them', async () => {
    const user = userEvent.setup();
    const asked = readsOf(() =>
      pageOf([product('Calm 90ct')], countsOf({ good: 1 })),
    );

    renderAt('/items?tab=all&discontinued=include&search=calm');
    await screen.findByRole('link', { name: 'Calm 90ct' });
    expect(asked[0]).toBe(
      'discontinued=include&search=calm&sort=name&order=asc',
    );

    await user.click(
      within(
        screen.getByRole('button', { name: 'Discontinued included' }),
      ).getByTestId('CancelIcon'),
    );
    await expect
      .poll(() => asked.at(-1))
      .toBe('search=calm&sort=name&order=asc');
  });

  it('shows a row’s code, its category’s path, its stock linking to Inventory for it alone, and Low or Out', async () => {
    readsOf(() =>
      pageOf(
        [
          {
            ...product('Fish oil'),
            id: 'fish',
            sku: 'FISH-1000',
            category: { id: 'c1', path: ['Vitamins', 'Fish oil'] },
            onHand: '1240.0000',
            unitOfMeasure: 'each',
            stockStatus: 'low',
          },
          {
            ...product('Focus'),
            id: 'focus',
            sku: 'FOC-30',
            variantCount: 3,
            onHand: null,
            unitOfMeasure: null,
            stockStatus: 'out',
          },
        ],
        countsOf({ good: 2 }),
      ),
    );

    renderAt('/items');

    const fish = (
      await screen.findByRole('link', { name: 'Fish oil' })
    ).closest('tr')!;
    expect(within(fish).getByText('FISH-1000')).toBeVisible();
    expect(within(fish).getByText('Vitamins › Fish oil')).toBeVisible();
    expect(
      within(fish).getByRole('link', { name: '1,240 each, stock of Fish oil' }),
    ).toHaveAttribute('href', '/inventory?productId=fish');
    expect(within(fish).getByText('Low stock')).toBeVisible();

    const focus = screen.getByRole('link', { name: 'Focus' }).closest('tr')!;
    expect(within(focus).getByText('3 variants · FOC-30, …')).toBeVisible();
    expect(within(focus).getByText('Uncategorised')).toBeVisible();
    expect(
      within(focus).getByRole('link', { name: '3 variants, stock of Focus' }),
    ).toBeVisible();
    expect(within(focus).getByText('Out')).toBeVisible();
  });

  it('opens the item from anywhere on its row', async () => {
    const user = userEvent.setup();
    readsOf(() => pageOf([product('Calm 90ct')], countsOf({ good: 1 })));
    renderWithAuth(
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route path="/items" element={<ProductsPage />} />
          <Route path="/items/:id" element={<p>The item’s page</p>} />
        </Routes>
      </MemoryRouter>,
      { permissions: ['products.view'] },
    );

    await user.click(await screen.findByText('CALM 90CT'));

    expect(await screen.findByText('The item’s page')).toBeVisible();
  });

  // A header sorts, again reverses; the date column shows the date sorted
  // by, its menu switching to Date added, newest first.
  it('sorts by a header, and switches the date column from its menu', async () => {
    const user = userEvent.setup();
    const asked = readsOf(() =>
      pageOf([product('Calm 90ct')], countsOf({ good: 1 })),
    );
    renderAt('/items');
    await screen.findByRole('link', { name: 'Calm 90ct' });
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute(
      'aria-sort',
      'ascending',
    );

    await user.click(screen.getByRole('button', { name: 'Category' }));
    await expect
      .poll(() => asked.at(-1))
      .toBe('type=good&sort=category&order=asc');
    await user.click(screen.getByRole('button', { name: 'Category' }));
    await expect
      .poll(() => asked.at(-1))
      .toBe('type=good&sort=category&order=desc');
    expect(screen.getByRole('button', { name: 'Category' })).toHaveFocus();

    await user.click(
      screen.getByRole('button', { name: 'Which date to show' }),
    );
    await user.click(screen.getByRole('menuitem', { name: 'Date added' }));
    await expect
      .poll(() => asked.at(-1))
      .toBe('type=good&sort=added&order=desc');
    expect(
      screen.getByRole('columnheader', { name: /Date added/ }),
    ).toHaveAttribute('aria-sort', 'descending');
  });

  // Show 50 more: the next page below, focus on its first row; failing,
  // the rows shown stay, with a line saying so and Try again.
  it('shows fifty more below with focus on the first new row, and keeps the rows when that fails', async () => {
    const user = userEvent.setup();
    let fail = true;
    const asked = readsOf((query) => {
      if (!query.get('cursor'))
        return pageOf([product('Calm 90ct')], countsOf({ good: 2 }), 'next');
      if (fail) throw new Error('down');
      return pageOf([product('Focus 60ct')]);
    });
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        const query = new URL(request.url).searchParams;
        if (query.get('cursor') && fail) {
          asked.push(query.toString());
          return HttpResponse.json(
            { message: 'Something went wrong' },
            { status: 500 },
          );
        }
        return undefined;
      }),
    );
    renderAt('/items');
    await screen.findByRole('link', { name: 'Calm 90ct' });
    expect(screen.getByText('Showing 1 of 2')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Show 50 more' }));
    expect(
      await screen.findByText('The next 50 could not be loaded.'),
    ).toBeVisible();
    expect(screen.getByRole('link', { name: 'Calm 90ct' })).toBeVisible();

    fail = false;
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    const added = await screen.findByRole('link', { name: 'Focus 60ct' });
    await waitFor(() => expect(added).toHaveFocus());
    expect(names()).toEqual(['Calm 90ct', 'Focus 60ct']);
  });

  // Failed: the list's part alone says so, with Try again; the tabs'
  // counts read "—", since nothing is known.
  it('says the list could not be read, with Try again, the tabs’ counts unknown', async () => {
    const user = userEvent.setup();
    let fail = true;
    server.use(
      http.get('/api/v1/products', () =>
        fail
          ? HttpResponse.json(
              { message: 'Something went wrong' },
              { status: 500 },
            )
          : HttpResponse.json(
              pageOf([product('Calm 90ct')], countsOf({ good: 1 })),
            ),
      ),
    );
    renderAt('/items');

    const retry = await screen.findByRole('button', { name: 'Try again' });
    expect(screen.getByRole('tab', { name: 'Products —' })).toBeVisible();
    expect(screen.getByRole('searchbox')).toBeVisible();

    fail = false;
    await user.click(retry);
    expect(
      await screen.findByRole('link', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(screen.getByRole('tab', { name: 'Products 1' })).toBeVisible();
  });

  // Partial (#306's 34): a search with no match on this tab says where
  // the matches are, with a button there.
  it('says where a search’s matches are when this tab has none, with a button there', async () => {
    const user = userEvent.setup();
    const asked = readsOf((query) =>
      pageOf(
        query.get('type') === 'material' ? [product('Vitamin C powder')] : [],
        countsOf({ good: 0, material: 1 }),
      ),
    );
    renderAt('/items?search=vitamin');

    expect(
      await screen.findByText(
        'Nothing in Products matches “vitamin”. 1 item in Raw materials matches.',
      ),
    ).toBeVisible();
    await user.click(
      screen.getByRole('button', { name: 'See in Raw materials' }),
    );

    expect(
      await screen.findByRole('link', { name: 'Vitamin C powder' }),
    ).toBeVisible();
    expect(asked.at(-1)).toBe(
      'type=material&search=vitamin&sort=name&order=asc',
    );
  });

  // A Viewer: one line in Add item's place, saying whom to ask.
  // The last uncategorised item moved left a list with no way out
  // (ADR-092's review, 7).
  it('says every item has a category once Uncategorised is empty, with Show all items', async () => {
    const user = userEvent.setup();
    const asked = readsOf((query) =>
      query.has('category')
        ? pageOf([], countsOf({ good: 0 }))
        : pageOf([product('Focus')], countsOf({ good: 1 })),
    );
    renderAt('/items?category=uncategorised');

    expect(await screen.findByText('Every item has a category.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Show all items' }));

    expect(await screen.findByRole('link', { name: 'Focus' })).toBeVisible();
    expect(asked.at(-1)).toBe('type=good&sort=name&order=asc');
  });

  it('says whom to ask where Add item would be, for a role that cannot add', async () => {
    readsOf(() => pageOf([product('Calm 90ct')], countsOf({ good: 1 })));
    server.use(
      http.get('/api/v1/account/membership', () =>
        HttpResponse.json({
          roles: [{ name: 'Viewer', description: null }],
          holdsEverything: false,
          whomToAsk: [{ id: 'user-1', name: 'Demo Owner' }],
        }),
      ),
    );
    renderAt('/items');

    expect(
      await screen.findByText(
        'Your role does not include adding items. To do more, ask Demo Owner.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Add item' })).toBeNull();
  });

  // The category filter: a tree with the open tab's counts; choosing one
  // reads it with those under it, and a chip shows it.
  it('narrows to a category from its tree, a chip showing it', async () => {
    const user = userEvent.setup();
    const asked = readsOf(() =>
      pageOf([product('Calm 90ct')], countsOf({ good: 3 })),
    );
    server.use(
      http.get('/api/v1/products/categories', () =>
        HttpResponse.json({
          categories: [
            {
              id: '00000000-0000-4000-8000-000000000001',
              name: 'Vitamins',
              parentId: null,
              items: [],
            },
            {
              id: '00000000-0000-4000-8000-000000000002',
              name: 'Vitamin C',
              parentId: '00000000-0000-4000-8000-000000000001',
              items: [{ type: 'good', active: 2, discontinued: 1 }],
            },
            {
              id: '00000000-0000-4000-8000-000000000003',
              name: 'Powders',
              parentId: null,
              items: [{ type: 'material', active: 4, discontinued: 0 }],
            },
          ],
        }),
      ),
    );
    renderAt('/items');
    await screen.findByRole('link', { name: 'Calm 90ct' });

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    const listbox = await screen.findByRole('listbox');
    expect(
      within(listbox)
        .getAllByRole('option')
        .map((option) => option.textContent),
    ).toEqual([
      'All categories',
      'Vitamins2',
      'Vitamin C2',
      'Uncategorised',
      'Manage categories',
    ]);
    await user.click(
      within(listbox).getByRole('option', {
        name: 'Vitamins › Vitamin C, 2 items',
      }),
    );

    await expect
      .poll(() => asked.at(-1))
      .toBe(
        'type=good&category=00000000-0000-4000-8000-000000000002&sort=name&order=asc',
      );
    expect(
      screen.getByRole('button', { name: 'Vitamins › Vitamin C' }),
    ).toBeVisible();
  });

  /**
   * Several at once (ADR-092): check boxes for whoever may change items,
   * a bar with how many, Set category, Discontinue and Clear; each change
   * at once, its message offering Undo with the values before.
   */
  describe('on a phone', () => {
    beforeEach(() => {
      // A phone's width, for the page's and the tabs' width queries.
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

    // The sheet's Clear wrote the filters, then the sort, each from the
    // address as it was, so the second put the filters back (MC-209).
    it('clears the category, Discontinued and the sort in the sheet at once', async () => {
      const user = userEvent.setup();
      const asked = readsOf(() =>
        pageOf([product('Focus')], countsOf({ good: 1 }, 1)),
      );
      renderAt(
        '/items?category=uncategorised&discontinued=only&sort=stock&order=asc',
      );

      await user.click(
        await screen.findByRole('button', { name: 'Filters · 2' }),
      );
      await user.click(screen.getByRole('button', { name: 'Clear' }));

      await waitFor(() =>
        expect(asked.at(-1)).toBe('type=good&sort=name&order=asc'),
      );
      await user.click(screen.getByRole('button', { name: 'Show 1' }));
      expect(
        await screen.findByRole('button', { name: 'Filters' }),
      ).toBeVisible();
    });

    // The cards have no head to tick every row (ADR-092's review, 12).
    it('ticks every card from the bar’s Select all', async () => {
      const user = userEvent.setup();
      readsOf(() =>
        pageOf(
          [product('Focus'), product('Calm'), product('Sleep')],
          countsOf({ good: 3 }),
        ),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <ProductsPage />
        </MemoryRouter>,
        { permissions: ['products.view', 'products.update'] },
      );

      await user.click(
        await screen.findByRole('checkbox', { name: 'Select Focus, FOCUS' }),
      );
      const bar = screen.getByRole('region', { name: 'Selected items' });
      await user.click(
        within(bar).getByRole('button', { name: 'Select all shown' }),
      );

      expect(within(bar).getByText('3 selected')).toBeVisible();
      expect(
        within(bar).queryByRole('button', { name: 'Select all shown' }),
      ).not.toBeInTheDocument();
    });
  });

  describe('several at once', () => {
    const CHANGER = { permissions: ['products.view', 'products.update'] };
    const VITAMIN_C = '00000000-0000-4000-8000-000000000002';
    const TREE = [
      {
        id: '00000000-0000-4000-8000-000000000001',
        name: 'Vitamins',
        parentId: null,
        items: [],
      },
      {
        id: VITAMIN_C,
        name: 'Vitamin C',
        parentId: '00000000-0000-4000-8000-000000000001',
        items: [],
      },
    ];

    /** Each PATCH's items, answered with each item's values before. */
    function changesOf(before: Record<string, ProductChange>) {
      const sent: ProductChange[][] = [];
      server.use(
        http.patch('/api/v1/products', async ({ request }) => {
          const { items } = (await request.json()) as ChangeProductsDto;
          sent.push(items);
          return HttpResponse.json({
            items: items.map((item) => before[item.id]),
          });
        }),
      );
      return sent;
    }

    const bar = () => screen.queryByRole('region', { name: 'Selected items' });
    const tick = (name: string) =>
      userEvent.click(
        screen.getByRole('checkbox', {
          name: `Select ${name}, ${name.toUpperCase()}`,
        }),
      );

    it('ticks rows for whoever may change items, the header’s ticking every row loaded, a bar counting them', async () => {
      const user = userEvent.setup();
      readsOf(() =>
        pageOf(
          [product('Calm 90ct'), product('Focus 60ct'), product('Sleep 30ct')],
          countsOf({ good: 3 }),
        ),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <Routes>
            <Route path="/items" element={<ProductsPage />} />
            <Route path="/items/:id" element={<p>The item’s page</p>} />
          </Routes>
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Calm 90ct' });
      expect(bar()).toBeNull();

      await tick('Calm 90ct');
      expect(within(bar()!).getByText('1 selected')).toBeVisible();
      expect(screen.queryByText('The item’s page')).toBeNull();
      const all = screen.getByRole('checkbox', {
        name: 'Select every item shown',
      });
      expect(all).toBePartiallyChecked();

      await user.click(all);
      expect(within(bar()!).getByText('3 selected')).toBeVisible();
      expect(
        screen
          .getAllByRole('checkbox')
          .every((box) => (box as HTMLInputElement).checked),
      ).toBe(true);

      await user.click(all);
      expect(bar()).toBeNull();

      await tick('Focus 60ct');
      await user.click(within(bar()!).getByRole('button', { name: 'Clear' }));
      expect(bar()).toBeNull();
      expect(
        screen.getByRole('checkbox', { name: 'Select Focus 60ct, FOCUS 60CT' }),
      ).not.toBeChecked();
    });

    it('shows a Viewer no check boxes', async () => {
      readsOf(() => pageOf([product('Calm 90ct')], countsOf({ good: 1 })));
      renderAt('/items');
      await screen.findByRole('link', { name: 'Calm 90ct' });

      expect(screen.queryAllByRole('checkbox')).toEqual([]);
    });

    it('clears the ticks on another tab, a new search, a filter or a sort, so nothing unseen changes', async () => {
      const user = userEvent.setup();
      const asked = readsOf(() =>
        pageOf([product('Calm 90ct')], countsOf({ good: 1, packaging: 1 })),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <ProductsPage />
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Calm 90ct' });

      const again = async (change: () => Promise<void>) => {
        await tick('Calm 90ct');
        expect(bar()).not.toBeNull();
        const reads = asked.length;
        await change();
        await waitFor(() => expect(asked.length).toBeGreaterThan(reads));
        expect(bar()).toBeNull();
        await screen.findByRole('link', { name: 'Calm 90ct' });
      };

      await again(() =>
        user.click(screen.getByRole('tab', { name: /Packaging/ })),
      );
      await again(() =>
        user.type(
          screen.getByRole('searchbox', { name: 'Search by name or code' }),
          'calm',
        ),
      );
      await again(() =>
        user.click(screen.getByRole('button', { name: /^Discontinued/ })),
      );
      await again(() =>
        user.click(screen.getByRole('button', { name: 'Name' })),
      );
    });

    it('moves the ticked to the category chosen, reads the list again, and Undo sends the values before', async () => {
      const user = userEvent.setup();
      server.use(
        http.get('/api/v1/products/categories', () =>
          HttpResponse.json({ categories: TREE }),
        ),
      );
      const asked = readsOf(() =>
        pageOf(
          [
            product('Calm 90ct'),
            {
              ...product('Focus 60ct'),
              category: { id: VITAMIN_C, path: ['Vitamins', 'Vitamin C'] },
            },
          ],
          countsOf({ good: 2 }),
        ),
      );
      const sent = changesOf({
        'Calm 90ct': { id: 'Calm 90ct', categoryId: null },
      });
      renderWithAuth(
        <ToastProvider>
          <MemoryRouter initialEntries={['/items']}>
            <ProductsPage />
          </MemoryRouter>
        </ToastProvider>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Calm 90ct' });

      await tick('Calm 90ct');
      await tick('Focus 60ct');
      await user.click(
        within(bar()!).getByRole('button', { name: 'Set category' }),
      );
      const dialog = await screen.findByRole('dialog', {
        name: 'Set the category of 2 items',
      });
      // Their categories differ: the box starts on None.
      const box = within(dialog).getByRole('combobox', { name: 'Category' });
      expect(box).toHaveTextContent('None (Uncategorised)');
      await user.click(box);
      expect(
        within(await screen.findByRole('listbox'))
          .getAllByRole('option')
          .map((option) => option.textContent),
      ).toEqual(['None (Uncategorised)', 'Vitamins', 'Vitamin C']);
      await user.click(
        screen.getByRole('option', { name: 'Vitamins › Vitamin C' }),
      );
      const reads = asked.length;
      await user.click(within(dialog).getByRole('button', { name: 'Move' }));

      // Only the one not in it already is sent.
      const undo = await screen.findByRole('button', { name: 'Undo' });
      expect(sent).toEqual([[{ id: 'Calm 90ct', categoryId: VITAMIN_C }]]);
      expect(screen.getByText('Moved 1 item to Vitamin C.')).toBeVisible();
      await waitFor(() => expect(undo).toHaveFocus());
      expect(bar()).toBeNull();
      await waitFor(() => expect(asked.length).toBeGreaterThan(reads));

      await user.click(undo);
      await waitFor(() =>
        expect(sent).toEqual([
          [{ id: 'Calm 90ct', categoryId: VITAMIN_C }],
          [{ id: 'Calm 90ct', categoryId: null }],
        ]),
      );
      expect(
        await screen.findByText('1 item is back as before.'),
      ).toBeVisible();
    });

    it('starts Set category on the category the ticked share, Move waiting for another', async () => {
      const user = userEvent.setup();
      server.use(
        http.get('/api/v1/products/categories', () =>
          HttpResponse.json({ categories: TREE }),
        ),
      );
      readsOf(() =>
        pageOf(
          [
            {
              ...product('Focus 60ct'),
              category: { id: VITAMIN_C, path: ['Vitamins', 'Vitamin C'] },
            },
          ],
          countsOf({ good: 1 }),
        ),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <ProductsPage />
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Focus 60ct' });

      await tick('Focus 60ct');
      await user.click(screen.getByRole('button', { name: 'Set category' }));
      const dialog = await screen.findByRole('dialog');

      expect(
        within(dialog).getByRole('combobox', { name: 'Category' }),
      ).toHaveTextContent('Vitamin C');
      expect(
        within(dialog).getByRole('button', { name: 'Move' }),
      ).toBeDisabled();
      expect(
        within(dialog).getByText('It is in this category already.'),
      ).toBeVisible();

      await user.click(within(dialog).getByRole('combobox'));
      await user.click(
        screen.getByRole('option', { name: 'None (Uncategorised)' }),
      );
      expect(
        within(dialog).getByRole('button', { name: 'Move' }),
      ).toBeEnabled();
    });

    it('discontinues the ticked still in use at once, and Undo brings them back', async () => {
      const user = userEvent.setup();
      readsOf(() =>
        pageOf(
          [product('Calm 90ct'), { ...product('Old 30ct'), isActive: false }],
          countsOf({ good: 2 }),
        ),
      );
      const sent = changesOf({
        'Calm 90ct': { id: 'Calm 90ct', isActive: true },
      });
      renderWithAuth(
        <MemoryRouter initialEntries={['/items?discontinued=include']}>
          <ProductsPage />
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Calm 90ct' });

      // Nothing ticked is in use: nothing to discontinue.
      await tick('Old 30ct');
      expect(
        within(bar()!).queryByRole('button', { name: 'Discontinue' }),
      ).toBeNull();

      await tick('Calm 90ct');
      await user.click(
        within(bar()!).getByRole('button', { name: 'Discontinue' }),
      );

      const undo = await screen.findByRole('button', { name: 'Undo' });
      expect(sent).toEqual([[{ id: 'Calm 90ct', isActive: false }]]);
      expect(screen.getByText('Discontinued 1 item.')).toBeVisible();
      await user.click(undo);
      await waitFor(() =>
        expect(sent.at(-1)).toEqual([{ id: 'Calm 90ct', isActive: true }]),
      );
    });

    it('says what was refused, keeping the ticks until they are cleared', async () => {
      const user = userEvent.setup();
      readsOf(() => pageOf([product('Calm 90ct')], countsOf({ good: 1 })));
      server.use(
        http.patch('/api/v1/products', () =>
          HttpResponse.json(
            {
              message:
                'One of these items was not found. Refresh the list, and try again.',
            },
            { status: 400 },
          ),
        ),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <ProductsPage />
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Calm 90ct' });

      await tick('Calm 90ct');
      await user.click(screen.getByRole('button', { name: 'Discontinue' }));

      expect(
        await screen.findByText(
          'One of these items was not found. Refresh the list, and try again.',
        ),
      ).toBeVisible();
      expect(within(bar()!).getByText('1 selected')).toBeVisible();

      // The refusal goes with the ticks it was for.
      await user.click(within(bar()!).getByRole('button', { name: 'Clear' }));
      expect(
        screen.queryByText(
          'One of these items was not found. Refresh the list, and try again.',
        ),
      ).toBeNull();
    });

    it('says to untick some past 500, before either runs', async () => {
      const user = userEvent.setup();
      readsOf(() =>
        pageOf(
          Array.from({ length: 501 }, (_, index) => product(`Item ${index}`)),
          countsOf({ good: 501 }),
        ),
      );
      renderWithAuth(
        <MemoryRouter initialEntries={['/items']}>
          <ProductsPage />
        </MemoryRouter>,
        CHANGER,
      );
      await screen.findByRole('link', { name: 'Item 0' });

      await user.click(
        screen.getByRole('checkbox', { name: 'Select every item shown' }),
      );

      expect(
        within(bar()!).getByText('Up to 500 at once. Untick some to go on.'),
      ).toBeVisible();
      expect(
        within(bar()!).getByRole('button', { name: 'Set category' }),
      ).toBeDisabled();
      expect(
        within(bar()!).getByRole('button', { name: 'Discontinue' }),
      ).toBeDisabled();

      await tick('Item 0');
      expect(
        within(bar()!).getByRole('button', { name: 'Set category' }),
      ).toBeEnabled();
      // 501 rows drawn and ticked take most of the 5 seconds alone, and
      // more with the other suites running beside it.
    }, 15_000);
  });
});
