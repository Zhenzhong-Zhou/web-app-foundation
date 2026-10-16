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

  // Vancouver's clocks go back at 2 am on 1 November 2026: midnight moves
  // from 07:00 UTC to 08:00 UTC, which a fixed offset would get wrong.
  it('follows the clock change, not a fixed offset', () => {
    const zone = 'America/Vancouver';
    expect(todayIn(zone, new Date('2026-11-01T07:30:00.000Z'))).toBe(
      '2026-11-01',
    );
    // 11:30 pm on 1 November, Pacific standard time (UTC−8).
    expect(todayIn(zone, new Date('2026-11-02T07:30:00.000Z'))).toBe(
      '2026-11-01',
    );
    expect(todayIn(zone, new Date('2026-11-02T08:00:00.000Z'))).toBe(
      '2026-11-02',
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
});
