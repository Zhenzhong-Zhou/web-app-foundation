import { describe, expect, it } from 'vitest';

import { presetRange, withDays, withInstants } from './date-range';

describe('presetRange', () => {
  const today = new Date(2026, 9, 7); // 7 October 2026, local

  it('counts months, quarters and years in the reader’s calendar', () => {
    expect(presetRange('thisMonth', today)).toEqual({
      from: '2026-10-01',
      to: '2026-10-31',
    });
    expect(presetRange('lastMonth', today)).toEqual({
      from: '2026-09-01',
      to: '2026-09-30',
    });
    expect(presetRange('thisQuarter', today)).toEqual({
      from: '2026-10-01',
      to: '2026-12-31',
    });
    expect(presetRange('thisYear', today)).toEqual({
      from: '2026-01-01',
      to: '2026-12-31',
    });
  });

  it('crosses a year for last month in January', () => {
    expect(presetRange('lastMonth', new Date(2027, 0, 15))).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
    });
  });
});

describe('withDays and withInstants', () => {
  it('adds the days as they are, after any query already there', () => {
    expect(
      withDays('/invoices', { from: '2026-09-01', to: '2026-09-30' }),
    ).toBe('/invoices?from=2026-09-01&to=2026-09-30');
    expect(withDays('/orders?status=all', { to: '2026-09-30' })).toBe(
      '/orders?status=all&to=2026-09-30',
    );
    expect(withDays('/invoices', {})).toBe('/invoices');
  });

  it('turns days into the instants they begin, the end one excluded', () => {
    const path = withInstants('/stock/movements', {
      from: '2026-09-01',
      to: '2026-09-30',
    });
    const params = new URL(path, 'http://x').searchParams;
    expect(params.get('from')).toBe(new Date(2026, 8, 1).toISOString());
    expect(params.get('until')).toBe(new Date(2026, 9, 1).toISOString());
  });
});
