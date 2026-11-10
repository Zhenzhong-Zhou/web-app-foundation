import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { delay, http, HttpResponse } from 'msw';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import type {
  CreateProductCategoryDto,
  ProductCategory,
  UpdateProductCategoryDto,
} from '../api/types.gen';
import { ToastProvider } from '../components/toast-provider';
import { renderWithAuth } from '../test/render-with-auth';
import { server } from '../test/setup';
import { CategoriesPage } from './categories-page';
import { CategoryFilter } from './category-filter';

function category(
  id: string,
  parentId: string | null,
  items: { active: number; discontinued?: number }[] = [],
): ProductCategory {
  return {
    id,
    name: id,
    parentId,
    items: items.map((count, index) => ({
      type: index === 0 ? 'good' : 'material',
      active: count.active,
      discontinued: count.discontinued ?? 0,
    })),
  };
}

/**
 * Vitamins holds one product itself and Vitamin C under it, two more;
 * Bottles holds one discontinued; Labels nothing.
 */
const TREE = [
  category('Bottles', null, [{ active: 0, discontinued: 1 }]),
  category('Labels', null),
  category('Vitamins', null, [{ active: 1 }]),
  category('Vitamin C', 'Vitamins', [{ active: 1 }, { active: 1 }]),
];

function answer(categories: ProductCategory[]) {
  server.use(
    http.get('/api/v1/products/categories', () =>
      HttpResponse.json({ categories, uncategorised: [] }),
    ),
  );
}

function renderPage(permissions = ['products.view', 'products.update']) {
  return renderWithAuth(
    <ToastProvider>
      <MemoryRouter initialEntries={['/settings/categories']}>
        <CategoriesPage />
      </MemoryRouter>
    </ToastProvider>,
    { permissions },
  );
}

/** A category's row: its list item, holding its name. */
async function rowOf(name: string) {
  const label = await screen.findByText(name, { selector: 'p' });
  return label.closest('li')!;
}

async function act(name: string, action: string) {
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole('button', { name: `Actions for ${name}` }),
  );
  await user.click(screen.getByRole('menuitem', { name: action }));
  return user;
}

describe('CategoriesPage', () => {
  beforeEach(() => {
    answer(TREE);
    server.use(
      http.get('/api/v1/account/membership', () =>
        HttpResponse.json({
          roles: [{ name: 'Viewer', description: null }],
          holdsEverything: false,
          whomToAsk: [{ id: 'owner', name: 'Demo Owner' }],
        }),
      ),
    );
  });

  it('shows the tree nested, each category with its items and those under it', async () => {
    renderPage();

    const vitamins = await rowOf('Vitamins');
    // Its own one, and Vitamin C's two under it.
    expect(within(vitamins).getByText('3 items')).toBeVisible();
    // Vitamin C is a list inside Vitamins' item, as a screen reader says.
    const inside = within(vitamins).getAllByRole('listitem');
    expect(inside).toHaveLength(1);
    expect(within(inside[0]).getByText('2 items')).toBeVisible();
    // A discontinued item is still in it; an empty one says so.
    expect(within(await rowOf('Bottles')).getByText('1 item')).toBeVisible();
    expect(within(await rowOf('Labels')).getByText('No items')).toBeVisible();
  });

  it('adds a category under the one chosen, then reads the tree again', async () => {
    const user = userEvent.setup();
    let sent: CreateProductCategoryDto | null = null;
    server.use(
      http.post('/api/v1/products/categories', async ({ request }) => {
        sent = (await request.json()) as CreateProductCategoryDto;
        answer([...TREE, category('Vitamin D', 'Vitamins')]);
        return HttpResponse.json(
          { category: category('Vitamin D', 'Vitamins') },
          { status: 201 },
        );
      }),
    );
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Add category' }),
    );
    const dialog = await screen.findByRole('dialog');
    await user.type(within(dialog).getByLabelText(/Name/), 'Vitamin D');
    await user.click(within(dialog).getByRole('combobox', { name: 'Under' }));
    await user.click(screen.getByRole('option', { name: 'Vitamins' }));
    await user.click(
      within(dialog).getByRole('button', { name: 'Add category' }),
    );

    expect(await screen.findByText('Added Vitamin D.')).toBeVisible();
    expect(sent).toEqual({ name: 'Vitamin D', parentId: 'Vitamins' });
    expect(
      await screen.findByText('Vitamin D', { selector: 'p' }),
    ).toBeVisible();
  });

  it('renames a category', async () => {
    let sent: UpdateProductCategoryDto | null = null;
    server.use(
      http.patch('/api/v1/products/categories/:id', async ({ request }) => {
        sent = (await request.json()) as UpdateProductCategoryDto;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    const user = await act('Labels', 'Rename');
    const name = within(screen.getByRole('dialog')).getByLabelText(/Name/);
    expect(name).toHaveValue('Labels');
    await user.clear(name);
    await user.type(name, 'Stickers');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByText('Renamed to Stickers.')).toBeVisible();
    expect(sent).toEqual({ name: 'Stickers' });
  });

  it('moves a category, its list leaving out its own branch, Move waiting for another place', async () => {
    let sent: UpdateProductCategoryDto | null = null;
    server.use(
      http.patch('/api/v1/products/categories/:id', async ({ request }) => {
        sent = (await request.json()) as UpdateProductCategoryDto;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    const user = await act('Vitamins', 'Move');
    const dialog = screen.getByRole('dialog', { name: 'Move Vitamins' });
    // At the top already: Move waits, saying why.
    expect(within(dialog).getByRole('button', { name: 'Move' })).toBeDisabled();
    expect(
      within(dialog).getByText('It is there already. Choose another place.'),
    ).toBeVisible();

    await user.click(within(dialog).getByRole('combobox', { name: 'Under' }));
    expect(
      screen.getAllByRole('option').map((option) => option.textContent),
    ).toEqual(['None (at the top)', 'Bottles', 'Labels']);
    await user.click(screen.getByRole('option', { name: 'Bottles' }));
    await user.click(within(dialog).getByRole('button', { name: 'Move' }));

    expect(
      await screen.findByText('Moved Vitamins under Bottles.'),
    ).toBeVisible();
    expect(sent).toEqual({ parentId: 'Bottles' });
  });

  it('refuses at its row to delete a category holding items or categories, saying how many and what to do', async () => {
    let asked = false;
    server.use(
      http.delete('/api/v1/products/categories/:id', () => {
        asked = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    await act('Vitamins', 'Delete');

    const vitamins = await rowOf('Vitamins');
    expect(
      within(vitamins).getByText(
        'Vitamins still holds 1 item and 1 category. Move what is in it to another category first, then delete Vitamins.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(asked).toBe(false);
  });

  it('asks before deleting an empty category, then deletes it', async () => {
    let deleted: string | null = null;
    server.use(
      http.delete('/api/v1/products/categories/:id', ({ params }) => {
        deleted = params.id as string;
        answer(TREE.filter((each) => each.id !== 'Labels'));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderPage();

    const user = await act('Labels', 'Delete');
    const dialog = screen.getByRole('dialog', { name: 'Delete Labels?' });
    await user.click(
      within(dialog).getByRole('button', { name: 'Delete category' }),
    );

    expect(await screen.findByText('Deleted Labels.')).toBeVisible();
    expect(deleted).toBe('Labels');
    await waitFor(() =>
      expect(
        screen.queryByText('Labels', { selector: 'p' }),
      ).not.toBeInTheDocument(),
    );
    await waitFor(() =>
      expect(screen.getByRole('heading', { name: 'Categories' })).toHaveFocus(),
    );
  });

  it('shows the server’s refusal at its row when something was put in it since the tree was read', async () => {
    server.use(
      http.delete('/api/v1/products/categories/:id', () =>
        HttpResponse.json(
          {
            statusCode: 409,
            message:
              'Labels still holds 1 item. Move it to another category first, then delete Labels.',
          },
          { status: 409 },
        ),
      ),
    );
    renderPage();

    const user = await act('Labels', 'Delete');
    await user.click(screen.getByRole('button', { name: 'Delete category' }));

    expect(
      await within(await rowOf('Labels')).findByText(
        'Labels still holds 1 item. Move it to another category first, then delete Labels.',
      ),
    ).toBeVisible();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('reads only for whoever may only see items, a line saying whom to ask', async () => {
    renderPage(['products.view']);

    expect(await rowOf('Vitamins')).toBeVisible();
    expect(
      await screen.findByText(
        'Your role does not include changing categories. To do more, ask Demo Owner.',
      ),
    ).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Add category' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: /^Actions for/ }),
    ).not.toBeInTheDocument();
  });

  it('says what to add first with none, and Add category', async () => {
    answer([]);
    renderPage();

    expect(
      await screen.findByText(
        'No categories yet. Add the first, such as Vitamins or Bottles, then put items in it on Items.',
      ),
    ).toBeVisible();
    expect(
      screen.getAllByRole('button', { name: 'Add category' }),
    ).toHaveLength(2);
  });

  // ADR-092's five states, two of them untested (ADR-092's review, 83).
  it('says it is loading, its placeholder rows only once the read takes a while', async () => {
    server.use(
      http.get('/api/v1/products/categories', async () => {
        await delay(400);
        return HttpResponse.json({ categories: TREE, uncategorised: [] });
      }),
    );
    renderPage();

    expect(screen.getByRole('status')).toHaveTextContent('Loading categories…');
    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
    await waitFor(() =>
      expect(document.querySelector('.MuiSkeleton-root')).not.toBeNull(),
    );
    expect(await rowOf('Vitamins')).toBeVisible();
    expect(document.querySelector('.MuiSkeleton-root')).toBeNull();
  });

  it('keeps the tree shown when it cannot be read again, saying so above it', async () => {
    server.use(
      http.patch(
        '/api/v1/products/categories/:id',
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    renderPage();

    const user = await act('Labels', 'Rename');
    // The tree read after the rename fails.
    server.use(
      http.get('/api/v1/products/categories', () =>
        HttpResponse.json(
          { statusCode: 500, message: 'Something went wrong' },
          { status: 500 },
        ),
      ),
    );
    const name = within(screen.getByRole('dialog')).getByLabelText(/Name/);
    await user.clear(name);
    await user.type(name, 'Stickers');
    await user.click(screen.getByRole('button', { name: 'Rename' }));

    expect(await screen.findByRole('alert')).toBeVisible();
    expect(await rowOf('Vitamins')).toBeVisible();
    expect(
      screen.queryByRole('button', { name: 'Try again' }),
    ).not.toBeInTheDocument();
  });

  it('says the tree could not be read, with Try again, which reads it again', async () => {
    const user = userEvent.setup();
    server.use(
      http.get('/api/v1/products/categories', () =>
        HttpResponse.json(
          { statusCode: 500, message: 'Something went wrong' },
          { status: 500 },
        ),
      ),
    );
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Try again' }));
    answer(TREE);
    await user.click(screen.getByRole('button', { name: 'Try again' }));

    expect(await rowOf('Vitamins')).toBeVisible();
  });

  it('opens from Items’ Manage categories with Back, which returns to Items as it was', async () => {
    const user = userEvent.setup();
    function Items() {
      const location = useLocation();
      return (
        <>
          <p>{`At ${location.pathname}${location.search}`}</p>
          <CategoryFilter options={[]} value="" onChange={() => undefined} />
        </>
      );
    }
    renderWithAuth(
      <ToastProvider>
        <MemoryRouter initialEntries={['/items?tab=material&sort=stock']}>
          <Routes>
            <Route path="/items" element={<Items />} />
            <Route path="/settings/categories" element={<CategoriesPage />} />
          </Routes>
        </MemoryRouter>
      </ToastProvider>,
      { permissions: ['products.view', 'products.update'] },
    );

    await user.click(screen.getByRole('combobox', { name: 'Category' }));
    await user.click(screen.getByRole('option', { name: 'Manage categories' }));
    expect(
      await screen.findByRole('heading', { name: 'Categories' }),
    ).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Back' }));

    expect(
      await screen.findByText('At /items?tab=material&sort=stock'),
    ).toBeVisible();
  });
});
