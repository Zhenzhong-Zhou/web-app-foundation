import { withQuery } from './api';
import type { CalendarDay } from './api-names';
import {
  organizationTimeZone,
  organizationToday,
  startOfDayIn,
} from './time-zone';

/**
 * Date ranges on lists (ADR-057): the reader picks days; the list asks for
 * them as calendar days (`from`, `to`, both included) or, for a list of
 * instants, as the instants those days begin and end in the organization's
 * time zone (`from` included, `until` excluded; ADR-072).
 */

/** Calendar days, YYYY-MM-DD, either open. */
export interface DayRange {
  from?: string;
  to?: string;
}

export type RangePreset =
  'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear';

export const RANGE_PRESETS: readonly RangePreset[] = [
  'thisMonth',
  'lastMonth',
  'thisQuarter',
  'thisYear',
];

/**
 * A day of the calendar as YYYY-MM-DD, counted in days, never hours, so a
 * day the clocks change on is one like any other (137a); months past 11
 * and days past a month's end roll over.
 */
export function calendarDay(year: number, month: number, date: number): string {
  return new Date(Date.UTC(year, month, date)).toISOString().slice(0, 10);
}

/**
 * The days a preset covers, counted from `today`: the organization's
 * (ADR-072), so "This month" is the same month for everyone in it.
 */
export function presetRange(
  preset: RangePreset,
  today: CalendarDay = organizationToday(),
): DayRange {
  const [year, calendarMonth] = today.split('-').map(Number);
  const month = calendarMonth - 1;

  switch (preset) {
    case 'thisMonth':
      return {
        from: calendarDay(year, month, 1),
        to: calendarDay(year, month + 1, 0),
      };
    case 'lastMonth':
      return {
        from: calendarDay(year, month - 1, 1),
        to: calendarDay(year, month, 0),
      };
    case 'thisQuarter': {
      const first = month - (month % 3);
      return {
        from: calendarDay(year, first, 1),
        to: calendarDay(year, first + 3, 0),
      };
    }
    case 'thisYear':
      return {
        from: calendarDay(year, 0, 1),
        to: calendarDay(year, 11, 31),
      };
  }
}

/** Movements' When menu, in its order (ADR-093, review 1). */
export type WhenPeriod =
  'today' | 'thisWeek' | 'thisMonth' | 'last30Days' | 'lastMonth' | 'thisYear';

export const WHEN_PERIODS: readonly WhenPeriod[] = [
  'today',
  'thisWeek',
  'thisMonth',
  'last30Days',
  'lastMonth',
  'thisYear',
];

/**
 * The days a When period covers, both included, counted from the
 * organization's `today` (ADR-072): one that holds today ends today, as
 * nothing has moved after it, so "This week" on Friday the 20th is Monday
 * the 16th to the 20th; Last month is the whole of it.
 */
export function whenRange(
  period: WhenPeriod,
  today: CalendarDay = organizationToday(),
): Required<DayRange> {
  const [year, calendarMonth, date] = today.split('-').map(Number);
  const month = calendarMonth - 1;
  const weekday = new Date(Date.UTC(year, month, date)).getUTCDay();

  switch (period) {
    case 'today':
      return { from: today, to: today };
    case 'thisWeek':
      // From Monday, for every reader and language (ISO 8601, 137a).
      return {
        from: calendarDay(year, month, date - ((weekday + 6) % 7)),
        to: today,
      };
    case 'thisMonth':
      return { from: calendarDay(year, month, 1), to: today };
    case 'last30Days':
      return { from: calendarDay(year, month, date - 29), to: today };
    case 'lastMonth':
      return presetRange('lastMonth', today) as Required<DayRange>;
    case 'thisYear':
      return { from: calendarDay(year, 0, 1), to: today };
  }
}

/** A list of calendar days: the days as they are. */
export function withDays(path: string, range: DayRange): string {
  return withQuery(path, { from: range.from, to: range.to });
}

/**
 * A list of instants: from the start of the first day to the start of the
 * day after the last, both in the organization's time zone (ADR-072), so
 * a day's range holds the same moments for everyone in it, as its presets
 * name the same days.
 */
export function withInstants(path: string, range: DayRange): string {
  const zone = organizationTimeZone();
  const dayAfter = (day: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return calendarDay(year, month - 1, date + 1);
  };

  return withQuery(path, {
    from: range.from ? startOfDayIn(zone, range.from).toISOString() : undefined,
    until: range.to
      ? startOfDayIn(zone, dayAfter(range.to)).toISOString()
      : undefined,
  });
}
