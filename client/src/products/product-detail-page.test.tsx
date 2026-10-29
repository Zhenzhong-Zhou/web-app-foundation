import { screen } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductDetail } from '../api/types.gen';
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
  images: [],
  translations: [
    { locale: 'fr-CA', name: 'Calme 90 capsules', description: null },
    { locale: 'zh-Hans', name: '舒缓胶囊 90 粒', description: null },
  ],
  variants: [],
};

function renderPage(product: ProductDetail) {
  server.use(
    http.get('/api/v1/products/:id', () => HttpResponse.json(product)),
  );
  renderWithAuth(
    <MemoryRouter initialEntries={['/products/product-1']}>
      <Routes>
        <Route path="/products/:id" element={<ProductDetailPage />} />
      </Routes>
    </MemoryRouter>,
    { permissions: ['products.view'] },
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
});
