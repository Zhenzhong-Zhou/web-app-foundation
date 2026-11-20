import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DayRange } from '../lib/date-range';
import { setOrganizationTimeZone } from '../lib/time-zone';
import { TestProviders } from '../test/test-providers';
import { WhenMenu } from './when-menu';

/** The menu, and the range it last wrote. */
function Harness({
  start = {},
  inline = false,
}: {
  start?: DayRange;
  inline?: boolean;
}) {
  const [range, setRange] = useState<DayRange>(start);
  return (
    <>
      <WhenMenu
        id="when"
        label="When"
        value={range}
        onChange={setRange}
        inline={inline}
      />
      <output aria-label="range">{JSON.stringify(range)}</output>
    </>
  );
}

const rangeOf = () =>
  JSON.parse(screen.getByRole('status', { name: 'range' }).textContent ?? '');
const when = () => screen.getByRole('combobox', { name: /^When/ });

// Review 1: When is one menu, each period with its days, in the
// organization's days.
describe('WhenMenu', () => {
  beforeEach(() => {
    // 1 pm on Friday 20 November in Vancouver, where the organization
    // is; already Saturday the 21st here in Tokyo.
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-20T21:00:00.000Z'));
    setOrganizationTimeZone('America/Vancouver');
  });
  afterEach(() => {
    setOrganizationTimeZone(null);
    vi.useRealTimers();
  });

  it('offers each period with its own days, a period that holds today ending today, then Choose dates… and Any time at its foot', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    expect(when()).toHaveTextContent('Any time');
    await user.click(when());

    expect(
      within(screen.getByRole('listbox'))
        .getAllByRole('option')
        // Intl's thin spaces around the dash, read as spaces.
        .map((option) => option.textContent?.replace(/\s/g, ' ')),
    ).toEqual([
      'Today · Nov 20',
      'This week · Nov 16 – 20',
      'This month · Nov 1 – 20',
      'Last 30 days · Oct 22 – Nov 20',
      'Last month · Oct 1 – 31',
      'This year · Jan 1 – Nov 20',
      'Choose dates…',
      'Any time',
    ]);
  });

  it('writes a period’s days and shows them in the field; Any time clears them', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: /^This week/ }));

    expect(rangeOf()).toEqual({ from: '2026-11-16', to: '2026-11-20' });
    expect(when()).toHaveTextContent('Nov 16, 2026 – Nov 20, 2026');

    await user.click(when());
    expect(screen.getByRole('option', { name: /^This week/ })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.click(screen.getByRole('option', { name: 'Any time' }));

    expect(rangeOf()).toEqual({});
    expect(when()).toHaveTextContent('Any time');
  });

  it.each([
    [{ from: '2026-11-01' }, 'from Nov 1, 2026'],
    [{ to: '2026-11-15' }, 'until Nov 15, 2026'],
  ])('reads one end alone in words, %o', (start, said) => {
    render(<Harness start={start} />, { wrapper: TestProviders });

    // Capitalised where it starts the field, by its first letter.
    expect(when()).toHaveTextContent(said);
  });

  it('opens From and To with Choose dates…, Apply writing both days, Clear emptying them', async () => {
    const user = userEvent.setup();
    render(<Harness start={{ from: '2026-10-01', to: '2026-10-31' }} />, {
      wrapper: TestProviders,
    });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));

    const from = await screen.findByLabelText('When from');
    const to = screen.getByLabelText('When to');
    expect(from).toHaveValue('2026-10-01');
    expect(to).toHaveValue('2026-10-31');

    await user.clear(to);
    await user.type(to, '2026-11-15');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(rangeOf()).toEqual({ from: '2026-10-01', to: '2026-11-15' });
    expect(screen.queryByLabelText('When from')).not.toBeInTheDocument();
    expect(when()).toHaveFocus();

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('When from')).toHaveValue('');
    expect(screen.getByLabelText('When to')).toHaveValue('');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(rangeOf()).toEqual({});
  });

  it('closes the menu with Escape, focus back on When, the days as they were', async () => {
    const user = userEvent.setup();
    render(<Harness start={{ from: '2026-11-01', to: '2026-11-20' }} />, {
      wrapper: TestProviders,
    });

    when().focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('listbox')).toBeVisible();
    await user.keyboard('{Escape}');

    await vi.waitFor(() =>
      expect(screen.queryByRole('listbox')).not.toBeInTheDocument(),
    );
    expect(when()).toHaveFocus();
    expect(rangeOf()).toEqual({ from: '2026-11-01', to: '2026-11-20' });
  });

  it('closes Choose dates… with Escape, focus back on When, nothing written', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));
    await user.type(await screen.findByLabelText('When from'), '2026-11-01');
    await user.keyboard('{Escape}');

    await vi.waitFor(() =>
      expect(screen.queryByLabelText('When from')).not.toBeInTheDocument(),
    );
    expect(when()).toHaveFocus();
    expect(rangeOf()).toEqual({});
  });

  it('opens the two dates under the field, on a phone', async () => {
    const user = userEvent.setup();
    render(<Harness inline />, { wrapper: TestProviders });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));

    expect(await screen.findByLabelText('When from')).toBeVisible();
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('When from'), '2026-11-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(rangeOf()).toEqual({ from: '2026-11-01' });
    expect(when()).toHaveTextContent('from Nov 1, 2026');
  });
});
