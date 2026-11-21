import { afterEach, describe, expect, it } from 'vitest';

import {
  presetRange,
  type WhenPeriod,
  whenRange,
  withDays,
  withInstants,
} from './date-range';
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

// 135a and 137a: Movements' When periods, from the organization's today.
describe('whenRange', () => {
  afterEach(() => setOrganizationTimeZone(null));

  const days = (period: WhenPeriod, today: string) => {
    const { from, to } = whenRange(period, today);
    return [from, to];
  };

  it('ends a period that holds today on today, Last month whole', () => {
    // Friday 20 November 2026.
    expect(days('today', '2026-11-20')).toEqual(['2026-11-20', '2026-11-20']);
    expect(days('thisWeek', '2026-11-20')).toEqual([
      '2026-11-16',
      '2026-11-20',
    ]);
    expect(days('thisMonth', '2026-11-20')).toEqual([
      '2026-11-01',
      '2026-11-20',
    ]);
    expect(days('last30Days', '2026-11-20')).toEqual([
      '2026-10-22',
      '2026-11-20',
    ]);
    expect(days('lastMonth', '2026-11-20')).toEqual([
      '2026-10-01',
      '2026-10-31',
    ]);
    expect(days('thisYear', '2026-11-20')).toEqual([
      '2026-01-01',
      '2026-11-20',
    ]);
  });

  // ISO 8601, for every reader and language: never Sunday, as the US
  // calendar starts it.
  it('starts a week on Monday, a Sunday’s on the Monday before, across a month and a year', () => {
    expect(days('thisWeek', '2026-11-22')).toEqual([
      '2026-11-16',
      '2026-11-22',
    ]);
    expect(days('thisWeek', '2026-11-23')).toEqual([
      '2026-11-23',
      '2026-11-23',
    ]);
    expect(days('thisWeek', '2026-11-01')).toEqual([
      '2026-10-26',
      '2026-11-01',
    ]);
    expect(days('thisWeek', '2027-01-01')).toEqual([
      '2026-12-28',
      '2027-01-01',
    ]);
  });

  // Calendar days, never 24 hours taken away: a day the clocks change on
  // is 23 or 25 hours long, and each period still begins at midnight on
  // its first day. The time-zone data the app runs on (2026e in Node
  // 26.12) moves Vancouver's clocks on 8 March 2026 and keeps it on
  // UTC−7 from 1 November 2026; Los Angeles moved them back that day.
  it('counts calendar days across a change of clocks, each beginning at midnight in the organization’s zone', () => {
    const instants = (period: WhenPeriod, today: string) => {
      const path = withInstants('/stock/movements', whenRange(period, today));
      const params = new URL(path, 'http://x').searchParams;
      return [params.get('from'), params.get('until')];
    };

    setOrganizationTimeZone('America/Vancouver');
    // Sunday 8 March, 23 hours long: the week from Monday the 2nd, on
    // UTC−8, to the end of the 8th, on UTC−7.
    expect(instants('thisWeek', '2026-03-08')).toEqual([
      '2026-03-02T08:00:00.000Z',
      '2026-03-09T07:00:00.000Z',
    ]);
    expect(instants('last30Days', '2026-03-20')).toEqual([
      '2026-02-19T08:00:00.000Z',
      '2026-03-21T07:00:00.000Z',
    ]);
    // Last 30 days on 20 November starts at midnight on 22 October.
    expect(instants('last30Days', '2026-11-20')[0]).toBe(
      '2026-10-22T07:00:00.000Z',
    );

    // Sunday 1 November in Los Angeles, 25 hours long.
    setOrganizationTimeZone('America/Los_Angeles');
    expect(instants('last30Days', '2026-11-20')).toEqual([
      '2026-10-22T07:00:00.000Z',
      '2026-11-21T08:00:00.000Z',
    ]);
    expect(instants('thisWeek', '2026-11-01')).toEqual([
      '2026-10-26T07:00:00.000Z',
      '2026-11-02T08:00:00.000Z',
    ]);
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

    // Clock changes that have happened, never ones to come: a law can drop
    // one, as British Columbia did with 1 November 2026's, and only newer
    // time-zone data knows.
    it('keeps each day whole across a change of clocks', () => {
      setOrganizationTimeZone('America/Vancouver');
      // 2 November 2025 was 25 hours long there, 8 March 2026 23.
      expect(instants('2025-11-02', '2025-11-02')).toEqual([
        '2025-11-02T07:00:00.000Z',
        '2025-11-03T08:00:00.000Z',
      ]);
      expect(instants('2026-03-08', '2026-03-08')).toEqual([
        '2026-03-08T08:00:00.000Z',
        '2026-03-09T07:00:00.000Z',
      ]);
    });

    it('begins a day that has no midnight when its clocks jump', () => {
      // Santiago, 7 September 2025: 23:59 on the 6th, then 01:00.
      setOrganizationTimeZone('America/Santiago');
      expect(instants('2025-09-06', '2025-09-06')).toEqual([
        '2025-09-06T04:00:00.000Z',
        '2025-09-07T04:00:00.000Z',
      ]);
    });
  });
});
