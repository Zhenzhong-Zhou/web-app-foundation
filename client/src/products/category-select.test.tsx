import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it } from 'vitest';

import type { ProductCategory } from '../api/types.gen';
import { CategoryFilter } from './category-filter';
import { CategorySelect } from './category-select';
import { categoryTree } from './item-list';

function category(
  id: string,
  name: string,
  parentId: string | null,
  active = 0,
): ProductCategory {
  return {
    id,
    name,
    parentId,
    items: active ? [{ type: 'good', active, discontinued: 0 }] : [],
  };
}

/** Two Bottles, one under Packaging and one under Samples. */
const TREE = [
  category('p', 'Packaging', null),
  category('pb', 'Bottles', 'p', 2),
  category('s', 'Samples', null),
  category('sb', 'Bottles', 's', 1),
];

// ADR-092's review, 8 and 79: the box read "Sleep3", and an option gave a
// screen reader its own name alone, Bottles twice.
describe('choosing a category', () => {
  it('names each option of a form’s Category by its path', async () => {
    const user = userEvent.setup();
    render(
      <CategorySelect
        id="category"
        label="Category"
        emptyLabel="None (Uncategorised)"
        categories={TREE}
        value=""
        onChange={() => undefined}
      />,
    );

    await user.click(screen.getByRole('combobox', { name: 'Category' }));

    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        .map(
          (option) => option.getAttribute('aria-label') ?? option.textContent,
        ),
    ).toEqual([
      'None (Uncategorised)',
      'Packaging',
      'Packaging › Bottles',
      'Samples',
      'Samples › Bottles',
    ]);
  });

  it('shows the filter’s chosen name alone in its box, each option named by its path and count', async () => {
    const user = userEvent.setup();
    render(
      <MemoryRouter>
        <CategoryFilter
          options={categoryTree(TREE, 'good', '')}
          value="pb"
          onChange={() => undefined}
        />
      </MemoryRouter>,
    );

    const box = screen.getByRole('combobox', { name: 'Category' });
    expect(box).toHaveTextContent(/^Bottles$/);

    await user.click(box);
    expect(
      screen.getByRole('option', { name: 'Packaging › Bottles, 2 items' }),
    ).toBeVisible();
    expect(
      screen.getByRole('option', { name: 'Samples, 1 item' }),
    ).toBeVisible();
  });
});
