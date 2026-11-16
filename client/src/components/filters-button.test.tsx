import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { FiltersButton } from './filters-button';

/** The filters a phone hides, behind one button (ADR-093; #481). */
describe('FiltersButton', () => {
  it('says how many filters are on, and opens them in a sheet named by its heading', async () => {
    const user = userEvent.setup();
    render(
      <FiltersButton on={2} shown={12} onClear={() => undefined}>
        <p>the category</p>
      </FiltersButton>,
    );

    expect(screen.queryByText('the category')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Filters · 2' }));

    const sheet = screen.getByRole('dialog', { name: 'Filters and sort' });
    expect(sheet).toHaveTextContent('the category');
  });

  it('reads Filters alone when none is on', () => {
    render(
      <FiltersButton on={0} shown={12} onClear={() => undefined}>
        <p>the category</p>
      </FiltersButton>,
    );

    expect(screen.getByRole('button', { name: 'Filters' })).toBeVisible();
  });

  // Clear is the list's one write; the sheet stays for another choice.
  it('clears them in the open sheet, and Show closes it on the list they made', async () => {
    const user = userEvent.setup();
    const onClear = vi.fn();
    render(
      <FiltersButton on={1} shown={12} onClear={onClear}>
        <p>the category</p>
      </FiltersButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Filters · 1' }));
    await user.click(screen.getByRole('button', { name: 'Clear' }));
    expect(onClear).toHaveBeenCalledOnce();
    expect(screen.getByRole('dialog')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Show 12' }));
    await waitFor(() =>
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument(),
    );
  });

  it('says Done while the list’s count is not known', async () => {
    const user = userEvent.setup();
    render(
      <FiltersButton on={0} shown={null} onClear={() => undefined}>
        <p>the category</p>
      </FiltersButton>,
    );

    await user.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByRole('button', { name: 'Done' })).toBeVisible();
  });
});
