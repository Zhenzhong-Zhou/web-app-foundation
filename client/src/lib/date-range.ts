import { withQuery } from './api';
import type { CalendarDay } from './api-names';
import { organizationToday } from './time-zone';

/**
 * Date ranges on lists (ADR-057): the reader picks days; the list asks for
 * them as calendar days (`from`, `to`, both included) or, for a list of
 * instants, as the instants those days begin and end in the reader's time
 * zone (`from` included, `until` excluded).
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

/** A day of the calendar as YYYY-MM-DD; months past 11 roll over. */
function calendarDay(year: number, month: number, date: number): string {
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

/** A list of calendar days: the days as they are. */
export function withDays(path: string, range: DayRange): string {
  return withQuery(path, { from: range.from, to: range.to });
}

/**
 * A list of instants: from the start of the first day to the start of the
 * day after the last, both in the reader's time zone.
 */
export function withInstants(path: string, range: DayRange): string {
  const start = (day: string) => {
    const [year, month, date] = day.split('-').map(Number);
    return new Date(year, month - 1, date);
  };
  const until = range.to ? start(range.to) : undefined;
  until?.setDate(until.getDate() + 1);

  return withQuery(path, {
    from: range.from ? start(range.from).toISOString() : undefined,
    until: until?.toISOString(),
  });
}
