import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

import type { DayRange } from '../lib/date-range';
import {
  browserTimeZone,
  setOrganizationTimeZone,
  todayIn,
} from '../lib/time-zone';
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

  // Review 1's polish: a thin line under the periods and under Choose
  // dates…; each period's name and days in one span, as a flex item of
  // their own would drop the space before the dot.
  it('sets the periods apart from Choose dates… and Any time, each period’s days beside its name', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    await user.click(when());
    const options = within(screen.getByRole('listbox')).getAllByRole('option');

    expect(
      options.map((option) => option.classList.contains('MuiMenuItem-divider')),
    ).toEqual([false, false, false, false, false, true, true, false]);
    expect(options[0]!.children).toHaveLength(1);
    expect(options[0]!.children[0]!.textContent).toBe('Today · Nov 20');
  });

  it('writes a period’s days and shows them in the field; Any time clears them', async () => {
    const user = userEvent.setup();
    render(<Harness />, { wrapper: TestProviders });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: /^This week/ }));

    expect(rangeOf()).toEqual({ from: '2026-11-16', to: '2026-11-20' });
    // Intl's range, the year once (review 1's polish).
    expect(when()).toHaveTextContent('Nov 16 – 20, 2026');

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

  // Review 22, S19: in Chinese the two fields are the glossary's From and
  // To, 起始日 and 结束日, never a sentence around the field's name, as
  // "自 时间 起" and "截至 时间" read.
  it('names From and To in the glossary’s words in Chinese', async () => {
    const user = userEvent.setup();
    localStorage.setItem('language', 'zh-Hans');
    try {
      render(<Harness />, { wrapper: TestProviders });

      // The catalogue arrives after the first render.
      await user.click(await screen.findByRole('combobox', { name: /^When/ }));
      await user.click(
        await screen.findByRole('option', { name: '选择日期…' }),
      );

      const panel = await screen.findByRole('dialog', { name: '选择日期' });
      expect(within(panel).getByLabelText('起始日')).toHaveValue('');
      expect(within(panel).getByLabelText('结束日')).toHaveValue('');
      expect(panel).not.toHaveTextContent(/自 .* 起|截至 时间/);
    } finally {
      localStorage.removeItem('language');
    }
  });

  // 130b: in Chinese the field and each period write their days the
  // Chinese way, the year once, as single days read, never ICU's
  // "2026/11/1 – 2026/11/20".
  it('writes its days the Chinese way in Chinese, the year once', async () => {
    const user = userEvent.setup();
    localStorage.setItem('language', 'zh-Hans');
    try {
      render(<Harness start={{ from: '2026-11-01', to: '2026-11-20' }} />, {
        wrapper: TestProviders,
      });

      // The catalogue arrives after the first render.
      await vi.waitFor(() =>
        expect(when()).toHaveTextContent(/^2026年11月1日至20日$/),
      );
      await user.click(when());
      expect(
        within(await screen.findByRole('listbox'))
          .getAllByRole('option')
          .slice(0, 6)
          .map((option) => option.textContent),
      ).toEqual([
        '今天 · 11月20日',
        '本周 · 11月16日至20日',
        '本月 · 11月1日至20日',
        '最近 30 天 · 10月22日至11月20日',
        '上月 · 10月1日至31日',
        '今年 · 1月1日至11月20日',
      ]);
    } finally {
      localStorage.removeItem('language');
    }
  });

  it('opens From and To with Choose dates…, Apply writing both days, Clear emptying them', async () => {
    const user = userEvent.setup();
    render(<Harness start={{ from: '2026-10-01', to: '2026-10-31' }} />, {
      wrapper: TestProviders,
    });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));

    // A panel titled for what it does, saying what the two days mean.
    const panel = await screen.findByRole('dialog', { name: 'Choose dates' });
    expect(
      within(panel).getByText(
        'Both days are included. Leave From empty for from the start, To empty for until today.',
      ),
    ).toBeVisible();
    const from = within(panel).getByLabelText('From');
    const to = within(panel).getByLabelText('To');
    expect(from).toHaveValue('2026-10-01');
    expect(to).toHaveValue('2026-10-31');

    await user.clear(to);
    await user.type(to, '2026-11-15');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(rangeOf()).toEqual({ from: '2026-10-01', to: '2026-11-15' });
    expect(screen.queryByLabelText('From')).not.toBeInTheDocument();
    expect(when()).toHaveFocus();

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));
    await user.click(await screen.findByRole('button', { name: 'Clear' }));
    expect(screen.getByLabelText('From')).toHaveValue('');
    expect(screen.getByLabelText('To')).toHaveValue('');
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
    await user.type(await screen.findByLabelText('From'), '2026-11-01');
    await user.keyboard('{Escape}');

    await vi.waitFor(() =>
      expect(screen.queryByLabelText('From')).not.toBeInTheDocument(),
    );
    expect(when()).toHaveFocus();
    expect(rangeOf()).toEqual({});
  });

  it('opens the two dates under the field, on a phone', async () => {
    const user = userEvent.setup();
    render(<Harness inline />, { wrapper: TestProviders });

    await user.click(when());
    await user.click(screen.getByRole('option', { name: 'Choose dates…' }));

    expect(await screen.findByLabelText('From')).toBeVisible();
    expect(screen.queryByRole('presentation')).not.toBeInTheDocument();
    await user.type(screen.getByLabelText('From'), '2026-11-01');
    await user.click(screen.getByRole('button', { name: 'Apply' }));

    expect(rangeOf()).toEqual({ from: '2026-11-01' });
    expect(when()).toHaveTextContent('from Nov 1, 2026');
  });
});

// 135a and 137a: the periods end on the organization's today, never the
// browser's, counted in calendar days, never by taking hours away, a week
// starting on Monday for every reader and language (ISO 8601).
describe('WhenMenu, in the organization’s days wherever the browser is', () => {
  beforeAll(() => {
    // The browser in Shanghai, UTC+8 all year, ahead of the
    // organization's day for much of it; Node takes a new TZ at once.
    vi.stubEnv('TZ', 'Asia/Shanghai');
  });
  afterAll(() => {
    vi.unstubAllEnvs();
  });
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    setOrganizationTimeZone('America/Vancouver');
  });
  afterEach(() => {
    setOrganizationTimeZone(null);
    vi.useRealTimers();
    localStorage.removeItem('language');
  });

  /** The menu's periods, as each reads. */
  const periods = async () => {
    await userEvent.setup().click(when());
    return within(await screen.findByRole('listbox'))
      .getAllByRole('option')
      .slice(0, 6)
      .map((option) => option.textContent?.replace(/\s/g, ' '));
  };

  it.each([
    [
      'en',
      'Any time',
      [
        'Today · Nov 22',
        'This week · Nov 16 – 22',
        'This month · Nov 1 – 22',
        'Last 30 days · Oct 24 – Nov 22',
        'Last month · Oct 1 – 31',
        'This year · Jan 1 – Nov 22',
      ],
    ],
    [
      'fr-CA',
      'N’importe quand',
      [
        'Aujourd’hui · 22 nov.',
        'Cette semaine · 16 – 22 nov.',
        'Ce mois-ci · 1 – 22 nov.',
        'Les 30 derniers jours · 24 oct. – 22 nov.',
        'Le mois dernier · 1 – 31 oct.',
        'Cette année · 1 janv. – 22 nov.',
      ],
    ],
    [
      'zh-Hans',
      '不限时间',
      [
        '今天 · 11月22日',
        '本周 · 11月16日至22日',
        '本月 · 11月1日至22日',
        '最近 30 天 · 10月24日至11月22日',
        '上月 · 10月1日至31日',
        '今年 · 1月1日至11月22日',
      ],
    ],
  ])(
    'in %s, ends each period on the organization’s Sunday, its week from Monday, while the browser is already on Monday',
    async (language, anyTime, expected) => {
      // The evening of Sunday 22 November in Vancouver; Monday the 23rd,
      // 11 am, in Shanghai.
      vi.setSystemTime(new Date('2026-11-23T03:00:00.000Z'));
      expect(browserTimeZone()).toBe('Asia/Shanghai');
      expect(todayIn(browserTimeZone())).toBe('2026-11-23');
      localStorage.setItem('language', language);
      render(<Harness />, { wrapper: TestProviders });

      // The catalogue arrives after the first render.
      await vi.waitFor(() => expect(when()).toHaveTextContent(anyTime));
      expect(await periods()).toEqual(expected);
      await userEvent.setup().click(screen.getAllByRole('option')[1]!);
      expect(rangeOf()).toEqual({ from: '2026-11-16', to: '2026-11-22' });
    },
  );

  // Clock changes the time-zone data has: Vancouver's on 8 March 2026,
  // and Los Angeles's on 1 November 2026, which Vancouver no longer has.
  // Late in the day, so 24 hours taken away 29 times, or the browser's
  // today, would land on another day.
  it.each([
    [
      // 11:30 pm on Sunday 8 March in Vancouver, the clocks put forward
      // that morning; Monday afternoon in Shanghai.
      'America/Vancouver',
      '2026-03-09T06:30:00.000Z',
      [
        'Today · Mar 8',
        'This week · Mar 2 – 8',
        'This month · Mar 1 – 8',
        'Last 30 days · Feb 7 – Mar 8',
        'Last month · Feb 1 – 28',
        'This year · Jan 1 – Mar 8',
      ],
    ],
    [
      // 12:30 am on Friday 20 March in Vancouver: 30 days by the hour
      // would start on 18 February.
      'America/Vancouver',
      '2026-03-20T07:30:00.000Z',
      [
        'Today · Mar 20',
        'This week · Mar 16 – 20',
        'This month · Mar 1 – 20',
        'Last 30 days · Feb 19 – Mar 20',
        'Last month · Feb 1 – 28',
        'This year · Jan 1 – Mar 20',
      ],
    ],
    [
      // 11:30 pm on Friday 20 November in Los Angeles, the clocks put
      // back on the 1st: 30 days by the hour would start on 23 October.
      'America/Los_Angeles',
      '2026-11-21T07:30:00.000Z',
      [
        'Today · Nov 20',
        'This week · Nov 16 – 20',
        'This month · Nov 1 – 20',
        'Last 30 days · Oct 22 – Nov 20',
        'Last month · Oct 1 – 31',
        'This year · Jan 1 – Nov 20',
      ],
    ],
    [
      // 11:30 pm on Friday 20 November in Vancouver, on UTC−7 since
      // March; Saturday afternoon in Shanghai.
      'America/Vancouver',
      '2026-11-21T06:30:00.000Z',
      [
        'Today · Nov 20',
        'This week · Nov 16 – 20',
        'This month · Nov 1 – 20',
        'Last 30 days · Oct 22 – Nov 20',
        'Last month · Oct 1 – 31',
        'This year · Jan 1 – Nov 20',
      ],
    ],
  ])(
    'counts calendar days across a change of clocks, in %s at %s',
    async (zone, now, expected) => {
      vi.setSystemTime(new Date(now));
      setOrganizationTimeZone(zone);
      render(<Harness />, { wrapper: TestProviders });

      expect(await periods()).toEqual(expected);
    },
  );
});
