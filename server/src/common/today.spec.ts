import { Logger } from '@nestjs/common';
import type { MockInstance } from 'vitest';

import { canonicalTimeZone, dayIn, todayIn } from './today';

/**
 * A day is decided in a time zone (ADR-052, ADR-072): the organization's,
 * or UTC for the cutoffs that must hold everywhere.
 */
describe('todayIn', () => {
  it('is the day in the zone, as YYYY-MM-DD', () => {
    expect(todayIn('UTC', new Date('2026-10-02T15:00:00.000Z'))).toBe(
      '2026-10-02',
    );
  });

  // 5 pm on 2 October in Vancouver is 00:00 on 3 October in UTC.
  it('turns over at midnight UTC for UTC', () => {
    expect(todayIn('UTC', new Date('2026-10-02T23:59:59.999Z'))).toBe(
      '2026-10-02',
    );
    expect(todayIn('UTC', new Date('2026-10-03T00:00:00.000Z'))).toBe(
      '2026-10-03',
    );
  });

  it('turns over at midnight in Vancouver for Vancouver', () => {
    const zone = 'America/Vancouver';
    // 5 pm and 11:59 pm on 16 October, Pacific daylight time (UTC−7).
    expect(todayIn(zone, new Date('2026-10-17T00:00:00.000Z'))).toBe(
      '2026-10-16',
    );
    expect(todayIn(zone, new Date('2026-10-17T06:59:59.999Z'))).toBe(
      '2026-10-16',
    );
    // Midnight on 17 October there.
    expect(todayIn(zone, new Date('2026-10-17T07:00:00.000Z'))).toBe(
      '2026-10-17',
    );
  });

  it('turns over at midnight in Shanghai for Shanghai', () => {
    const zone = 'Asia/Shanghai';
    // 11:59 pm on 16 October in Shanghai (UTC+8), still the 16th in UTC.
    expect(todayIn(zone, new Date('2026-10-16T15:59:59.999Z'))).toBe(
      '2026-10-16',
    );
    expect(todayIn(zone, new Date('2026-10-16T16:00:00.000Z'))).toBe(
      '2026-10-17',
    );
  });

  // Vancouver's clocks spring forward at 2 am on 8 March 2026: that day is
  // 23 hours long, from 08:00 UTC to 07:00 UTC the next morning.
  it('follows the spring change, a day an hour short', () => {
    const zone = 'America/Vancouver';
    expect(todayIn(zone, new Date('2026-03-08T07:59:59.999Z'))).toBe(
      '2026-03-07',
    );
    expect(todayIn(zone, new Date('2026-03-08T08:00:00.000Z'))).toBe(
      '2026-03-08',
    );
    // 1:59 am, then 3:00 am: the clocks jump, the day does not.
    expect(todayIn(zone, new Date('2026-03-08T09:59:59.999Z'))).toBe(
      '2026-03-08',
    );
    expect(todayIn(zone, new Date('2026-03-08T10:00:00.000Z'))).toBe(
      '2026-03-08',
    );
    // 11:59 pm on 8 March, Pacific daylight time (UTC−7).
    expect(todayIn(zone, new Date('2026-03-09T06:59:59.999Z'))).toBe(
      '2026-03-08',
    );
    expect(todayIn(zone, new Date('2026-03-09T07:00:00.000Z'))).toBe(
      '2026-03-09',
    );
  });

  // Vancouver's clocks went back at 2 am on 2 November 2025: midnight moved
  // from 07:00 UTC to 08:00 UTC, which a fixed offset would get wrong. A
  // change that has happened, never one to come: British Columbia dropped
  // the one due on 1 November 2026, and only newer time-zone data knows.
  it('follows the clock change, not a fixed offset', () => {
    const zone = 'America/Vancouver';
    expect(todayIn(zone, new Date('2025-11-02T07:30:00.000Z'))).toBe(
      '2025-11-02',
    );
    // 11:30 pm on 2 November, Pacific standard time (UTC−8).
    expect(todayIn(zone, new Date('2025-11-03T07:30:00.000Z'))).toBe(
      '2025-11-02',
    );
    expect(todayIn(zone, new Date('2025-11-03T08:00:00.000Z'))).toBe(
      '2025-11-03',
    );
  });
});

describe('dayIn', () => {
  it('reads a stored moment, string or Date, in the zone', () => {
    const shipped = '2026-10-17T01:30:00.000Z';
    expect(dayIn('UTC', shipped)).toBe('2026-10-17');
    expect(dayIn('America/Vancouver', shipped)).toBe('2026-10-16');
    expect(dayIn('Asia/Shanghai', new Date(shipped))).toBe('2026-10-17');
  });
});

describe('canonicalTimeZone', () => {
  it('takes an IANA name, and UTC', () => {
    expect(canonicalTimeZone('America/Vancouver')).toBe('America/Vancouver');
    expect(canonicalTimeZone('Asia/Shanghai')).toBe('Asia/Shanghai');
    expect(canonicalTimeZone('UTC')).toBe('UTC');
  });

  it('refuses an offset, which is wrong half the year', () => {
    expect(canonicalTimeZone('+05:00')).toBeNull();
    expect(canonicalTimeZone('-0800')).toBeNull();
  });

  it('refuses a name no zone has', () => {
    expect(canonicalTimeZone('Mars/Olympus_Mons')).toBeNull();
    expect(canonicalTimeZone('')).toBeNull();
    expect(canonicalTimeZone('America/')).toBeNull();
  });

  it('refuses an offset under another name: only UTC or a place', () => {
    for (const name of ['Etc/GMT+8', 'Etc/UTC', 'GMT', 'EST', 'MST', 'HST']) {
      expect(canonicalTimeZone(name)).toBeNull();
    }
    expect(canonicalTimeZone('utc')).toBe('UTC');
    expect(canonicalTimeZone('US/Pacific')).toBe('America/Los_Angeles');
  });

  it('takes every zone Node lists', () => {
    const refused = Intl.supportedValuesOf('timeZone').filter(
      (zone) => canonicalTimeZone(zone) === null,
    );
    expect(refused).toEqual([]);
  });

  // Node's ICU names these as CLDR does; Safari lists only the second.
  it.each([
    ['Africa/Asmera', 'Africa/Asmara'],
    ['America/Buenos_Aires', 'America/Argentina/Buenos_Aires'],
    ['America/Catamarca', 'America/Argentina/Catamarca'],
    ['America/Coral_Harbour', 'America/Atikokan'],
    ['America/Cordoba', 'America/Argentina/Cordoba'],
    ['America/Godthab', 'America/Nuuk'],
    ['America/Indianapolis', 'America/Indiana/Indianapolis'],
    ['America/Jujuy', 'America/Argentina/Jujuy'],
    ['America/Louisville', 'America/Kentucky/Louisville'],
    ['America/Mendoza', 'America/Argentina/Mendoza'],
    ['Asia/Calcutta', 'Asia/Kolkata'],
    ['Asia/Katmandu', 'Asia/Kathmandu'],
    ['Asia/Rangoon', 'Asia/Yangon'],
    ['Asia/Saigon', 'Asia/Ho_Chi_Minh'],
    ['Atlantic/Faeroe', 'Atlantic/Faroe'],
    ['Europe/Kiev', 'Europe/Kyiv'],
    ['Pacific/Enderbury', 'Pacific/Kanton'],
    ['Pacific/Ponape', 'Pacific/Pohnpei'],
    ['Pacific/Truk', 'Pacific/Chuuk'],
  ])('stores %s under its current name, %s', (legacy, current) => {
    expect(canonicalTimeZone(legacy)).toBe(current);
    expect(canonicalTimeZone(current)).toBe(current);
  });
});

describe('a stored zone the server cannot read', () => {
  let warn: MockInstance;

  beforeEach(() => {
    warn = vi
      .spyOn(Logger.prototype, 'warn')
      .mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  it('decides its days in UTC, and says so once', () => {
    const late = new Date('2026-10-16T23:28:00.000Z');
    expect(todayIn('Mars/Olympus_Mons', late)).toBe('2026-10-16');
    expect(dayIn('Mars/Olympus_Mons', '2026-10-17T00:30:00.000Z')).toBe(
      '2026-10-17',
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0][0])).toContain('Mars/Olympus_Mons');
  });
});
