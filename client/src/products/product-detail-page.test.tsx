import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  ProductCategory,
  ProductDetail,
  UpdateProductDto,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { ProductDetailPage } from './product-detail-page';

/** As a reader in Chinese gets it: the heading in Chinese, `name` the base. */
const PRODUCT: ProductDetail = {
  id: 'product-1',
  type: 'good',
  name: 'Calm 90ct',
  displayName: '舒缓胶囊 90 粒',
  description: null,
  isActive: true,
  categoryId: null,
  images: [],
  translations: [
    { locale: 'fr-CA', name: 'Calme 90 capsules', description: null },
    { locale: 'zh-Hans', name: '舒缓胶囊 90 粒', description: null },
  ],
  variants: [],
};

const TREE: ProductCategory[] = [
  { id: 'bottles', name: 'Bottles', parentId: null, items: [] },
  { id: 'caps', name: 'Bottles and caps', parentId: 'bottles', items: [] },
];

function renderPage(product: ProductDetail, permissions = ['products.view']) {
  // The categories first: `:id` would match them too.
  server.use(
    http.get('/api/v1/products/categories', () =>
      HttpResponse.json({ categories: TREE }),
    ),
    http.get('/api/v1/products/:id', () => HttpResponse.json(product)),
  );
  renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/items/product-1']}>
        <Routes>
          <Route path="/items/:id" element={<ProductDetailPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
    { permissions },
  );
}

describe('ProductDetailPage', () => {
  /**
   * The heading is the reader's language (ADR-056), so the base name, which
   * the edit form fills from and documents print where a language has none,
   * is said among the names in other languages.
   */
  it('names the base name beside the others, under a translated heading', async () => {
    renderPage(PRODUCT);

    expect(
      await screen.findByRole('heading', { name: '舒缓胶囊 90 粒' }),
    ).toBeVisible();
    expect(screen.getByText('Base name: Calm 90ct')).toBeVisible();
  });

  it('says no base name of its own where it has no other names', async () => {
    renderPage({ ...PRODUCT, displayName: 'Calm 90ct', translations: [] });

    expect(
      await screen.findByRole('heading', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(screen.queryByText(/Base name/)).toBeNull();
  });

  /** Its type and its category's path under its name (ADR-092). */
  it('shows its type and category under its name', async () => {
    renderPage({ ...PRODUCT, type: 'packaging', categoryId: 'caps' });

    expect(
      await screen.findByText('Packaging · Bottles › Bottles and caps'),
    ).toBeVisible();
  });

  it('says Uncategorised under its name when it is in no category', async () => {
    renderPage({ ...PRODUCT, type: 'supply' });

    expect(await screen.findByText('Supplies · Uncategorised')).toBeVisible();
  });

  /**
   * Edit changes its name, description, category and type (#306's 30),
   * starting from the base name, and sends only what changed, so History
   * records what the person changed; a new type says where it moves.
   */
  it('edits its name, description, category and type, sending only what changed', async () => {
    const sent: UpdateProductDto[] = [];
    server.use(
      http.patch('/api/v1/products/:id', async ({ request }) => {
        sent.push((await request.json()) as UpdateProductDto);
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const user = userEvent.setup();
    renderPage({ ...PRODUCT, type: 'supply' }, [
      'products.view',
      'products.update',
    ]);

    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit the item' });
    expect(screen.getByRole('textbox', { name: /^Name/ })).toHaveValue(
      'Calm 90ct',
    );
    expect(screen.getByText(/A new type moves it to that tab/)).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    await user.click(screen.getByRole('option', { name: 'Packaging' }));
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Bottles and caps' }));
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(sent).toEqual([{ type: 'packaging', categoryId: 'caps' }]);
    expect(await screen.findByText('Item saved')).toBeVisible();
  });
});
