import { screen, waitFor, within } from '@testing-library/react';
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

function variant(
  id: string,
  sku: string,
  name: string | null,
  translations: { locale: 'en' | 'fr-CA' | 'zh-Hans'; name: string }[],
): ProductDetail['variants'][number] {
  return {
    id,
    sku,
    name,
    unitOfMeasure: 'each',
    isActive: true,
    tracksLots: false,
    weightGrams: null,
    lengthMm: null,
    widthMm: null,
    heightMm: null,
    caseQuantity: null,
    displayName: name ?? sku,
    translations,
  };
}

const TREE: ProductCategory[] = [
  { id: 'bottles', name: 'Bottles', parentId: null, items: [] },
  { id: 'caps', name: 'Bottles and caps', parentId: 'bottles', items: [] },
];

function renderPage(
  product: ProductDetail,
  permissions = ['products.view'],
  required: string[] = [],
) {
  // The categories first: `:id` would match them too.
  server.use(
    // The languages its documents require; the rest of the organization
    // is not read here.
    http.get('/api/v1/organization', () =>
      HttpResponse.json({
        organization: { requiredNameLanguages: required },
      }),
    ),
    http.get('/api/v1/products/categories', () =>
      HttpResponse.json({ categories: TREE, uncategorised: [] }),
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
    // The base name says what it is until it has a language of its own
    // (#531).
    expect(
      screen.getByRole('rowheader', {
        name: /^Item Calm 90ct\s*·\s*the name it was added with, used in any language without its own name$/,
      }),
    ).toBeVisible();
    expect(screen.getByRole('cell', { name: '舒缓胶囊 90 粒' })).toBeVisible();
  });

  it('says no base name of its own where it has no other names', async () => {
    renderPage({ ...PRODUCT, displayName: 'Calm 90ct', translations: [] });

    expect(
      await screen.findByRole('heading', { name: 'Calm 90ct' }),
    ).toBeVisible();
    expect(
      screen.queryByRole('table', { name: 'Names in other languages' }),
    ).toBeNull();
  });

  /**
   * One table (ADR-092, #526): the item and each variation with a name of
   * its own, a column for each language, those documents require marked
   * so. A missing required name reads Missing, with Add, and a line at the
   * top names what is missing; a variation with no name has no row.
   */
  it('shows the item’s and each named variation’s names by language, a missing required one marked', async () => {
    renderPage(
      {
        ...PRODUCT,
        name: 'Focus',
        displayName: 'Focus',
        translations: [{ locale: 'en', name: 'Focus', description: null }],
        variants: [
          variant('variant-1', 'FOC-30', '30 capsules', [
            { locale: 'en', name: '30 capsules' },
          ]),
          variant('variant-2', 'adasd', '213123', []),
          variant('variant-3', 'FOC-PLAIN', null, []),
        ],
      },
      ['products.view', 'products.update'],
      ['en'],
    );

    const table = await screen.findByRole('table', {
      name: 'Names in other languages',
    });
    // Once the organization's required languages are read.
    expect(
      await within(table).findByRole('columnheader', {
        name: 'English Required on documents',
      }),
    ).toBeVisible();
    expect(
      within(table).getByRole('columnheader', { name: '简体中文' }),
    ).toBeVisible();

    const rows = within(table).getAllByRole('rowheader');
    expect(rows.map((row) => row.textContent)).toEqual([
      'ItemFocus · the name it was added with, used in any language without its own name',
      'Variant FOC-3030 capsules',
      'Variant adasd213123',
    ]);
    const adasd = within(table).getByRole('row', { name: /adasd/ });
    expect(within(adasd).getByText('Missing')).toBeVisible();
    expect(
      within(adasd).getByRole('button', {
        name: 'Add the English name of variant adasd',
      }),
    ).toBeVisible();
    expect(
      screen.getByText(/A variant with no name of its own prints the item’s/),
    ).toBeVisible();

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'A name documents require is missing: the English name of variant adasd. Orders and invoices holding this item cannot print until it is added.',
    );
  });

  /** Add opens Edit names at that row and language, the required marked. */
  it('opens Edit names at the missing name’s row, the required languages marked', async () => {
    const user = userEvent.setup();
    renderPage(
      {
        ...PRODUCT,
        variants: [variant('variant-2', 'adasd', '213123', [])],
      },
      ['products.view', 'products.update'],
      ['en'],
    );

    await user.click(
      await screen.findByRole('button', {
        name: 'Add the English name of variant adasd',
      }),
    );

    const dialog = screen.getByRole('dialog');
    expect(
      within(dialog).getByRole('textbox', {
        name: 'adasd: 213123, in English',
      }),
    ).toHaveFocus();
    expect(
      within(dialog).getByRole('heading', {
        name: 'English Required on documents',
      }),
    ).toBeVisible();
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
    expect(
      screen.getByText(
        'It then shows under its new type. Its stock, lots and History stay as they are.',
      ),
    ).toBeVisible();

    await user.click(screen.getByRole('combobox', { name: 'Type' }));
    // Each type with Add item's line under it (ADR-092's review, 9).
    expect(
      screen.getByRole('option', {
        name: 'Packaging Bottles, boxes and labels',
      }),
    ).toBeVisible();
    await user.click(screen.getByRole('option', { name: /^Packaging/ }));
    expect(screen.getByRole('combobox', { name: 'Type' })).toHaveTextContent(
      /^Packaging$/,
    );
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(
      screen.getByRole('option', { name: 'Bottles › Bottles and caps' }),
    );
    await user.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(sent).toEqual([{ type: 'packaging', categoryId: 'caps' }]);
    // Where it went, not only "Item saved" (ADR-092's review, 24).
    expect(await screen.findByText('Moved to Packaging.')).toBeVisible();
  });
});
