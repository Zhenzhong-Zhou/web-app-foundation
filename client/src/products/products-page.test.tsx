import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import {
  createMemoryRouter,
  MemoryRouter,
  RouterProvider,
} from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductSummary } from '../api/types.gen';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductsPage } from './products-page';

function product(name: string): ProductSummary {
  return {
    id: name,
    coverFileId: null,
    type: 'good',
    name,
    description: null,
    isActive: true,
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

const names = () =>
  within(screen.getAllByRole('rowgroup')[1])
    .getAllByRole('link')
    .map((link) => link.textContent);

/**
 * Searched on the server (ADR-056, amended): the page sends what is typed
 * and shows what comes back, in the order it comes, matching nothing
 * itself.
 */
describe('ProductsPage', () => {
  it('asks with the address’s search, and lists the answer in its order', async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        asked.push(new URL(request.url).searchParams.get('search'));
        // Best match first, not by name, and not containing the query:
        // the server found it by its pinyin.
        return HttpResponse.json([
          product('专注胶囊 60 粒'),
          product('Calm 90ct'),
        ]);
      }),
    );

    renderAt('/products?search=zzjn');

    expect(
      await screen.findByRole('link', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(asked).toEqual(['zzjn']);
    expect(screen.getByRole('searchbox', { name: 'Search' })).toHaveValue(
      'zzjn',
    );
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
          return HttpResponse.json([product('Fog lamp')]);
        }
        return HttpResponse.json(
          search === 'foc' ? [product('Focus 60ct')] : [product('Calm 90ct')],
        );
      }),
    );

    renderAt('/products');
    await screen.findByRole('link', { name: 'Calm 90ct' });

    const box = screen.getByRole('searchbox', { name: 'Search' });
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
          return HttpResponse.json([product('Focus 60ct')]);
        await answered;
        return HttpResponse.json([product('Calm 90ct')]);
      }),
    );

    renderAt('/products');
    await screen.findByRole('link', { name: 'Focus 60ct' });

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), 'calm');
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

  it('says no products yet for an empty catalogue, and nothing matches for an empty search', async () => {
    const user = userEvent.setup();
    const answered: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        answered.push(new URL(request.url).searchParams.get('search'));
        return HttpResponse.json([]);
      }),
    );

    renderAt('/products');
    expect(await screen.findByText('No products yet.')).toBeVisible();

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '鱼');
    await expect.poll(() => answered).toEqual([null, '鱼']);
    expect(
      await screen.findByText('Nothing matches that search.'),
    ).toBeVisible();
    expect(screen.queryByText('No products yet.')).not.toBeInTheDocument();
  });

  /**
   * The search in the address while the page stays open (#260's done
   * when): "Show all in Items" from the top bar on Products itself, then
   * Back and Forward. Every list on useListSearch does the same.
   */
  it('follows the address while open, and writes what is typed there without adding to the history', async () => {
    const user = userEvent.setup();
    const asked: (string | null)[] = [];
    server.use(
      http.get('/api/v1/products', ({ request }) => {
        const search = new URL(request.url).searchParams.get('search');
        asked.push(search);
        return HttpResponse.json([product(`Found by ${search ?? 'nothing'}`)]);
      }),
    );
    const router = createMemoryRouter(
      [{ path: '/products', element: <ProductsPage /> }],
      { initialEntries: ['/products?search=calm'] },
    );
    renderWithAuth(<RouterProvider router={router} />, {
      permissions: ['products.view'],
    });
    const box = screen.getByRole('searchbox', { name: 'Search' });
    await screen.findByRole('link', { name: 'Found by calm' });

    // Show all, from the lookup's box, as the lookup goes there.
    await act(() => router.navigate('/products?search=zzjn'));
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
});
