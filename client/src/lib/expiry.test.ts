import { describe, expect, it } from 'vitest';

import { daysUntil, expiryTone, localToday } from './expiry';

describe('expiry', () => {
  it('counts whole calendar days, today being 0', () => {
    expect(daysUntil('2026-10-27', '2026-10-07')).toBe(20);
    expect(daysUntil('2026-10-07', '2026-10-07')).toBe(0);
    expect(daysUntil('2026-10-04', '2026-10-07')).toBe(-3);
  });

  /** North American clocks go back on 1 November 2026. */
  it('is not thrown off by a change of clocks', () => {
    expect(daysUntil('2026-11-02', '2026-10-31')).toBe(2);
    expect(daysUntil('2027-03-15', '2027-03-13')).toBe(2);
  });

  it('turns critical within 30 days or past, warning within 90', () => {
    expect(expiryTone(-1)).toBe('critical');
    expect(expiryTone(0)).toBe('critical');
    expect(expiryTone(30)).toBe('critical');
    expect(expiryTone(31)).toBe('warning');
    expect(expiryTone(90)).toBe('warning');
    expect(expiryTone(91)).toBeNull();
  });

  it('reads today from the local clock, not UTC', () => {
    // 23:30 local on 6 October is already 7 October in UTC west of it.
    expect(localToday(new Date(2026, 9, 6, 23, 30))).toBe('2026-10-06');
  });
});
