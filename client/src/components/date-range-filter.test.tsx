import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { presetRange } from '../lib/date-range';
import { TestProviders } from '../test/test-providers';
import { DateRangeFilter } from './date-range-filter';

function Harness() {
  const [range, setRange] = useState({});
  return (
    <DateRangeFilter label="Invoice date" value={range} onChange={setRange} />
  );
}

describe('DateRangeFilter', () => {
  it('names its fields for the date it narrows by', () => {
    render(<Harness />, { wrapper: TestProviders });
    expect(screen.getByLabelText('Invoice date from')).toBeTruthy();
    expect(screen.getByLabelText('Invoice date to')).toBeTruthy();
  });

  it('fills both days from a period, and clears them with Any date', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    await user.click(screen.getByRole('button', { name: 'Period' }));
    await user.click(screen.getByRole('menuitem', { name: 'Last month' }));

    const { from, to } = presetRange('lastMonth');
    expect(
      (screen.getByLabelText('Invoice date from') as HTMLInputElement).value,
    ).toBe(from);
    expect(
      (screen.getByLabelText('Invoice date to') as HTMLInputElement).value,
    ).toBe(to);

    await user.click(screen.getByRole('button', { name: 'Period' }));
    await user.click(screen.getByRole('menuitem', { name: 'Any date' }));
    expect(
      (screen.getByLabelText('Invoice date from') as HTMLInputElement).value,
    ).toBe('');
  });

  it('reports a typed day as it changes', async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(
      <DateRangeFilter label="Expected" value={{}} onChange={onChange} />,
      { wrapper: TestProviders },
    );
    await user.type(screen.getByLabelText('Expected to'), '2026-09-30');
    expect(onChange).toHaveBeenLastCalledWith({ to: '2026-09-30' });
  });
});
