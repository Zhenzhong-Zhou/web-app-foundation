import { afterEach, describe, expect, it } from 'vitest';

import { presetRange, withDays, withInstants } from './date-range';
import { setOrganizationTimeZone } from './time-zone';

describe('presetRange', () => {
  const today = '2026-10-07';

  it('counts months, quarters and years in the organization’s calendar', () => {
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
    expect(presetRange('lastMonth', '2027-01-15')).toEqual({
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

  describe('in the organization’s zone, not this computer’s (ADR-072)', () => {
    afterEach(() => setOrganizationTimeZone(null));

    const instants = (from: string, to: string) => {
      const path = withInstants('/stock/movements', { from, to });
      const params = new URL(path, 'http://x').searchParams;
      return [params.get('from'), params.get('until')];
    };

    it('turns days into the instants they begin, the end one excluded', () => {
      // This computer is in Tokyo; the organization in Vancouver.
      setOrganizationTimeZone('America/Vancouver');
      expect(instants('2026-09-01', '2026-09-30')).toEqual([
        '2026-09-01T07:00:00.000Z',
        '2026-10-01T07:00:00.000Z',
      ]);
    });

    it('keeps each day whole across a change of clocks', () => {
      setOrganizationTimeZone('America/Vancouver');
      // 8 March 2026 is 23 hours long there, 1 November 25.
      expect(instants('2026-03-08', '2026-03-08')).toEqual([
        '2026-03-08T08:00:00.000Z',
        '2026-03-09T07:00:00.000Z',
      ]);
      expect(instants('2026-11-01', '2026-11-01')).toEqual([
        '2026-11-01T07:00:00.000Z',
        '2026-11-02T08:00:00.000Z',
      ]);
    });

    it('begins a day that has no midnight when its clocks jump', () => {
      // Santiago, 6 September 2026: 23:59 on the 5th, then 01:00.
      setOrganizationTimeZone('America/Santiago');
      expect(instants('2026-09-05', '2026-09-05')).toEqual([
        '2026-09-05T04:00:00.000Z',
        '2026-09-06T04:00:00.000Z',
      ]);
    });
  });
});
