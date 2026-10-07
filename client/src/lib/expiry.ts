import type { ToneName } from '../theme/tokens';
import type { CalendarDay } from './types';

/**
 * Within this many days a lot's expiry turns amber, then red (ADR-055).
 * Fixed for every organization for now; a setting of each organization's
 * own waits with branding (Open decisions).
 */
export const EXPIRY_DAYS = { warning: 90, critical: 30 } as const;

/** The person's own calendar day, YYYY-MM-DD, by their clock and zone. */
export function localToday(now: Date = new Date()): CalendarDay {
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${now.getFullYear()}-${month}-${day}`;
}

function utcMidnight(day: CalendarDay): number {
  const [year, month, date] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, date);
}

/**
 * Whole days from today to a calendar day: 0 is today, below 0 is past.
 * Both are read as UTC midnights, so a change of clocks cannot make a day
 * 23 or 25 hours long and the count off by one.
 */
export function daysUntil(
  day: CalendarDay,
  today: CalendarDay = localToday(),
): number {
  return Math.round((utcMidnight(day) - utcMidnight(today)) / 86_400_000);
}

/** Critical within 30 days or past, warning within 90, else nothing. */
export function expiryTone(days: number): ToneName | null {
  if (days <= EXPIRY_DAYS.critical) return 'critical';
  if (days <= EXPIRY_DAYS.warning) return 'warning';
  return null;
}
