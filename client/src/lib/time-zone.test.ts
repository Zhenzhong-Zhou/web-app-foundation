import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  allTimeZones,
  browserTimeZone,
  cityOf,
  currentName,
  offsetLabel,
  organizationDayOf,
  organizationToday,
  sameZone,
  setOrganizationTimeZone,
  todayIn,
} from './time-zone';

/**
 * The organization's day (ADR-072), as the server's todayIn decides it:
 * the two must agree, or a screen and the server would disagree about a
 * licence near midnight.
 */
describe('time zones', () => {
  afterEach(() => setOrganizationTimeZone(null));

  // 4:28 pm on Friday 16 October in Vancouver; already Saturday in UTC.
  const moment = new Date('2026-10-16T23:28:00.000Z');

  it('reads the day in the zone, not in UTC', () => {
    expect(todayIn('America/Vancouver', moment)).toBe('2026-10-16');
    expect(todayIn('UTC', moment)).toBe('2026-10-16');
    expect(todayIn('Asia/Shanghai', moment)).toBe('2026-10-17');
    expect(todayIn('America/Vancouver', new Date('2026-10-17T06:59:59Z'))).toBe(
      '2026-10-16',
    );
  });

  it("reads a moment's day in the organization's zone", () => {
    setOrganizationTimeZone('America/Vancouver');
    expect(organizationDayOf('2026-10-17T06:59:59Z')).toBe('2026-10-16');
    expect(organizationDayOf(new Date('2026-10-17T07:00:00Z'))).toBe(
      '2026-10-17',
    );
  });

  it("counts from the organization's today once the session says its zone", () => {
    setOrganizationTimeZone('Asia/Shanghai');
    expect(organizationToday(moment)).toBe('2026-10-17');
    setOrganizationTimeZone('America/Vancouver');
    expect(organizationToday(moment)).toBe('2026-10-16');
  });

  it('writes the offset as people do, through the clock change', () => {
    expect(offsetLabel('America/Vancouver', moment)).toBe('UTC\u22127');
    expect(
      offsetLabel('America/Vancouver', new Date('2026-11-02T12:00:00Z')),
    ).toBe('UTC\u22128');
    expect(offsetLabel('Asia/Kolkata', moment)).toBe('UTC+5:30');
    expect(offsetLabel('UTC', moment)).toBe('UTC+0');
  });

  it('names the city from the standard name', () => {
    expect(cityOf('America/Los_Angeles')).toBe('Los Angeles');
    expect(cityOf('America/Argentina/Buenos_Aires')).toBe('Buenos Aires');
    expect(cityOf('UTC')).toBe('UTC');
  });

  // Safari lists offsets under other names, which the server refuses.
  it('lists UTC and places, never Etc/GMT+8', () => {
    vi.spyOn(Intl, 'supportedValuesOf').mockReturnValue([
      'Etc/GMT+8',
      'Asia/Kolkata',
      'Etc/GMT-14',
      'America/Vancouver',
    ]);

    expect(allTimeZones(moment)).toEqual([
      'America/Vancouver',
      'UTC',
      'Asia/Kolkata',
    ]);
  });

  // This runtime, as Chrome, lists Kolkata as Asia/Calcutta, Kyiv as
  // Europe/Kiev; the server stores the current names (ADR-072).
  it('names every zone as the server stores it, whichever browser lists it', () => {
    const zones = allTimeZones(moment);
    expect(zones).toContain('Asia/Kolkata');
    expect(zones).toContain('Europe/Kyiv');
    expect(zones.filter((zone) => currentName(zone) !== zone)).toEqual([]);

    vi.spyOn(Intl.DateTimeFormat.prototype, 'resolvedOptions').mockReturnValue({
      ...new Intl.DateTimeFormat().resolvedOptions(),
      timeZone: 'Asia/Calcutta',
    });
    expect(browserTimeZone()).toBe('Asia/Kolkata');
  });

  it('knows one zone under two names, as this browser does', () => {
    expect(sameZone('Asia/Kolkata', 'Asia/Calcutta')).toBe(true);
    expect(sameZone('Europe/Kyiv', 'Europe/Kiev')).toBe(true);
    expect(sameZone('Asia/Kolkata', 'Asia/Kathmandu')).toBe(false);
  });
});
