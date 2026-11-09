import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type {
  CreateProductDto,
  ProductCategory,
  ProductDetail,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CreateProductDialog } from './create-product-dialog';
import type { ProductType } from './product-types';

const TREE: ProductCategory[] = [
  { id: 'raw', name: 'Raw', parentId: null, items: [] },
  { id: 'vitamins', name: 'Vitamins', parentId: 'raw', items: [] },
];

const CREATED: ProductDetail = {
  id: 'product-9',
  type: 'equipment',
  name: 'Capsule filling machine',
  displayName: 'Capsule filling machine',
  description: null,
  isActive: true,
  categoryId: null,
  images: [],
  translations: [],
  variants: [],
};

/** Where the router is, so a test can see the form give way to the item. */
function Where() {
  const location = useLocation();
  return <output aria-label="where">{location.pathname}</output>;
}

function renderDialog(type: ProductType | null) {
  const user = userEvent.setup();
  renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/items']}>
        <Routes>
          <Route
            path="/items"
            element={
              <CreateProductDialog
                type={type}
                categories={TREE}
                onClose={() => undefined}
              />
            }
          />
          <Route path="/items/:id" element={<Where />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
    { permissions: ['products.view', 'products.create'] },
  );
  return user;
}

describe('CreateProductDialog', () => {
  /**
   * Add item asks what it is first (ADR-092): from a type's tab that type
   * is chosen, from All none is, and Add item with none chosen says so
   * under the types, sending nothing.
   */
  it('asks what it is first, chosen from the tab, none from All, and says so under the types', async () => {
    let sent = false;
    server.use(
      http.post('/api/v1/products', () => {
        sent = true;
        return HttpResponse.json({ product: CREATED }, { status: 201 });
      }),
    );

    const user = renderDialog(null);
    const types = screen.getByRole('radiogroup');
    for (const name of [
      /^Products/,
      /^Raw materials/,
      /^Packaging/,
      /^Supplies/,
      /^Samples/,
      /^Equipment/,
    ]) {
      expect(within(types).getByRole('radio', { name })).not.toBeChecked();
    }
    expect(
      within(types).getByRole('radio', { name: /Used up in production/ }),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Machine');
    await user.type(screen.getByRole('textbox', { name: /^Code/ }), 'EQ-1');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(screen.getByText('Choose what it is.')).toBeVisible();
    expect(
      within(types).getByRole('radio', { name: /^Products/ }),
    ).toHaveFocus();
    expect(sent).toBe(false);
  });

  it('starts on the open tab’s type', () => {
    renderDialog('material');

    expect(screen.getByRole('radio', { name: /^Raw materials/ })).toBeChecked();
  });

  /** Equipment is never offered lot tracking; a line says how it counts. */
  it('never offers lot tracking for equipment, saying how equipment counts', async () => {
    let body: CreateProductDto | null = null;
    server.use(
      http.post('/api/v1/products', async ({ request }) => {
        body = (await request.json()) as CreateProductDto;
        return HttpResponse.json({ product: CREATED }, { status: 201 });
      }),
    );

    const user = renderDialog('material');
    await user.click(
      screen.getByRole('switch', { name: 'Track lot numbers and expiry' }),
    );
    await user.click(screen.getByRole('radio', { name: /^Equipment/ }));

    expect(
      screen.queryByRole('switch', { name: 'Track lot numbers and expiry' }),
    ).toBeNull();
    expect(screen.getByText(/Equipment is not tracked by lot/)).toBeVisible();

    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Machine');
    await user.type(screen.getByRole('textbox', { name: /^Code/ }), 'EQ-1');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    await waitFor(() => expect(body).not.toBeNull());
    expect(body!.type).toBe('equipment');
    expect(body!.variant.tracksLots).toBe(false);
  });

  /**
   * A code in use is refused under Code, saying what to do next, with a
   * link to the item that has it (#306's 35).
   */
  it('refuses a code in use under Code, opening the item that has it', async () => {
    server.use(
      http.post('/api/v1/products', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            error: 'Conflict',
            message:
              'Code RM-VITC is already used by Vitamin C powder. Choose another code.',
            code: 'code_in_use',
            details: { productId: 'product-1' },
          },
          { status: 409 },
        ),
      ),
    );

    const user = renderDialog('material');
    await user.type(screen.getByRole('textbox', { name: /^Name/ }), 'Powder');
    await user.type(screen.getByRole('textbox', { name: /^Code/ }), 'RM-VITC');
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    const code = screen.getByRole('textbox', { name: /^Code/ });
    await waitFor(() => expect(code).toBeInvalid());
    expect(code).toHaveAccessibleDescription(
      /Code RM-VITC is already used by Vitamin C powder\. Choose another code\./,
    );
    // Under the field, not above the form.
    expect(screen.queryByRole('alert')).toBeNull();

    await user.click(
      screen.getByRole('link', { name: 'Open the item that has it' }),
    );
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent(
      '/items/product-1',
    );
  });

  /**
   * Once added, the new item's page takes the form's place, its category
   * sent as chosen, and the message names what was added (ADR-092).
   */
  it('opens the new item’s page in the form’s place, saying what was added', async () => {
    let body: CreateProductDto | null = null;
    server.use(
      http.post('/api/v1/products', async ({ request }) => {
        body = (await request.json()) as CreateProductDto;
        return HttpResponse.json({ product: CREATED }, { status: 201 });
      }),
    );

    const user = renderDialog('equipment');
    await user.type(
      screen.getByRole('textbox', { name: /^Name/ }),
      'Capsule filling machine',
    );
    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Vitamins' }));
    await user.type(
      screen.getByRole('textbox', { name: /^Code/ }),
      'EQ-CAP-01',
    );
    await user.click(screen.getByRole('button', { name: 'Add item' }));

    expect(
      await screen.findByText('Added “Capsule filling machine”.'),
    ).toBeVisible();
    expect(screen.getByRole('status', { name: 'where' })).toHaveTextContent(
      '/items/product-9',
    );
    expect(body!.categoryId).toBe('vitamins');
    expect(body!.variant).toEqual({
      sku: 'EQ-CAP-01',
      unitOfMeasure: 'each',
      tracksLots: false,
    });
  });
});
