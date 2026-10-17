import { afterEach, describe, expect, it } from 'vitest';

import {
  cityOf,
  offsetLabel,
  organizationToday,
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
});
