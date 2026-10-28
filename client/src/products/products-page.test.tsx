import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter } from 'react-router-dom';
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

  it('says no products yet for an empty catalogue, and nothing matches for an empty search', async () => {
    const user = userEvent.setup();
    server.use(http.get('/api/v1/products', () => HttpResponse.json([])));

    renderAt('/products');
    expect(await screen.findByText('No products yet.')).toBeVisible();

    await user.type(screen.getByRole('searchbox', { name: 'Search' }), '鱼');
    expect(
      await screen.findByText('Nothing matches that search.'),
    ).toBeVisible();
    expect(screen.queryByText('No products yet.')).not.toBeInTheDocument();
  });
});
