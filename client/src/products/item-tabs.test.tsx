import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ItemTab } from './item-list';
import { ItemTabs } from './item-tabs';

/** A window this wide, for the tabs' width queries; jsdom has none. */
function widthIs(px: number) {
  vi.stubGlobal('matchMedia', (query: string) => {
    const min = /min-width:\s*([\d.]+)px/.exec(query);
    const max = /max-width:\s*([\d.]+)px/.exec(query);
    return {
      matches: (!min || px >= Number(min[1])) && (!max || px <= Number(max[1])),
      media: query,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    };
  });
}

const TABS: ItemTab[] = [
  'good',
  'material',
  'packaging',
  'supply',
  'sample',
  'equipment',
  'all',
];
const COUNTS: Record<ItemTab, number> = {
  good: 128,
  material: 46,
  packaging: 22,
  supply: 9,
  sample: 6,
  equipment: 3,
  all: 214,
};

function renderTabs(current: ItemTab, onChoose = vi.fn()) {
  render(
    <ItemTabs
      tabs={TABS}
      current={current}
      onChoose={onChoose}
      count={(tab) => COUNTS[tab]}
    />,
  );
  return onChoose;
}

describe('ItemTabs', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('shows every tab with its count on a laptop', () => {
    widthIs(1366);
    renderTabs('good');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Products 128',
      'Raw materials 46',
      'Packaging 22',
      'Supplies 9',
      'Samples 6',
      'Equipment 3',
      'All 214',
    ]);
  });

  // Never a sideways scroll (#487): the rest under More, with their counts,
  // the open one kept in the bar.
  it('puts the tabs that do not fit under More with their counts, keeping the open one', async () => {
    widthIs(820);
    const onChoose = renderTabs('equipment');

    expect(screen.getAllByRole('tab').map((tab) => tab.textContent)).toEqual([
      'Products 128',
      'Raw materials 46',
      'Packaging 22',
      'Equipment 3',
      'More',
    ]);

    await userEvent.click(screen.getByRole('tab', { name: 'More' }));
    const menu = await screen.findByRole('menu');
    expect(
      within(menu)
        .getAllByRole('menuitem')
        .map((item) => item.textContent),
    ).toEqual(['Supplies (9)', 'Samples (6)', 'All (214)']);

    await userEvent.click(
      within(menu).getByRole('menuitem', { name: 'All (214)' }),
    );
    expect(onChoose).toHaveBeenCalledWith('all');
  });

  it('is one select on a phone, saying which type and how many', async () => {
    widthIs(390);
    const onChoose = renderTabs('good');

    expect(screen.queryByRole('tab')).toBeNull();
    const select = screen.getByRole('combobox', { name: 'Type' });
    expect(select).toHaveTextContent('Products (128)');

    await userEvent.click(select);
    await userEvent.click(
      await screen.findByRole('option', { name: 'Raw materials (46)' }),
    );
    expect(onChoose).toHaveBeenCalledWith('material');
  });
});
