import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { setOrganizationTimeZone } from '../lib/time-zone';
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
    // 10 pm on 31 October in Vancouver, where the organization is; already
    // 1 November here in Tokyo. Last month is the organization's: September.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-01T05:00:00.000Z'));
    setOrganizationTimeZone('America/Vancouver');
    try {
      const user = userEvent.setup();
      render(<Harness />, { wrapper: TestProviders });

      await user.click(screen.getByRole('button', { name: 'Period' }));
      await user.click(screen.getByRole('menuitem', { name: 'Last month' }));

      expect(
        (screen.getByLabelText('Invoice date from') as HTMLInputElement).value,
      ).toBe('2026-09-01');
      expect(
        (screen.getByLabelText('Invoice date to') as HTMLInputElement).value,
      ).toBe('2026-09-30');

      await user.click(screen.getByRole('button', { name: 'Period' }));
      await user.click(screen.getByRole('menuitem', { name: 'Any date' }));
      expect(
        (screen.getByLabelText('Invoice date from') as HTMLInputElement).value,
      ).toBe('');
    } finally {
      setOrganizationTimeZone(null);
      vi.useRealTimers();
    }
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
