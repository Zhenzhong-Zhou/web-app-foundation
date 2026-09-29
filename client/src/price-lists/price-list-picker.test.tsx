import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http, HttpResponse } from 'msw';
import { describe, expect, it, vi } from 'vitest';

import type { PriceList } from '../lib/types';
import { server } from '../test/setup';
import { PriceListPicker } from './price-list-picker';

/**
 * The picker offers active lists of one side, keeps a retired list visible
 * only while it is the current choice, and reports None as null.
 */

const LISTS: PriceList[] = [
  {
    id: 'wholesale',
    name: 'Wholesale CAD',
    direction: 'sale',
    currency: 'CAD',
    isActive: true,
    itemCount: 12,
  },
  {
    id: 'old',
    name: 'Old retail',
    direction: 'sale',
    currency: 'CAD',
    isActive: false,
    itemCount: 3,
  },
];

function serve() {
  let asked: string | null = null;

  server.use(
    http.get('/api/v1/price-lists', ({ request }) => {
      asked = new URL(request.url).searchParams.get('direction');
      return HttpResponse.json({ priceLists: LISTS });
    }),
  );

  return () => asked;
}

async function open() {
  const user = userEvent.setup();
  const combobox = await screen.findByRole('combobox', { name: 'Sales' });
  await user.click(combobox);
  return { user, listbox: screen.getByRole('listbox') };
}

describe('PriceListPicker', () => {
  it('asks for one side, and offers only the active lists', async () => {
    const asked = serve();

    render(
      <PriceListPicker
        id="picker"
        label="Sales"
        direction="sale"
        value={null}
        onChange={vi.fn()}
      />,
    );

    const { listbox } = await open();

    expect(asked()).toBe('sale');
    expect(within(listbox).getByRole('option', { name: 'None' })).toBeVisible();
    expect(
      within(listbox).getByRole('option', { name: /Wholesale CAD/ }),
    ).toBeVisible();
    expect(
      within(listbox).queryByRole('option', { name: /Old retail/ }),
    ).not.toBeInTheDocument();
  });

  it('shows a retired list that is still the choice, but not as a choice', async () => {
    serve();

    render(
      <PriceListPicker
        id="picker"
        label="Sales"
        direction="sale"
        value="old"
        onChange={vi.fn()}
      />,
    );

    const { listbox } = await open();

    expect(
      within(listbox).getByRole('option', {
        name: 'Old retail (CAD) — retired',
      }),
    ).toHaveAttribute('aria-disabled', 'true');
  });

  it('reports None as null', async () => {
    serve();
    const onChange = vi.fn();

    render(
      <PriceListPicker
        id="picker"
        label="Sales"
        direction="sale"
        value="wholesale"
        onChange={onChange}
      />,
    );

    const { user, listbox } = await open();
    await user.click(within(listbox).getByRole('option', { name: 'None' }));

    expect(onChange).toHaveBeenCalledWith(null);
  });
});
