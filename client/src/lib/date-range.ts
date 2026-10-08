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

/** A local date as YYYY-MM-DD, in the reader's calendar. */
export function dayOf(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

/** The days a preset covers, counted from `today` in the reader's calendar. */
export function presetRange(preset: RangePreset, today = new Date()): DayRange {
  const year = today.getFullYear();
  const month = today.getMonth();

  switch (preset) {
    case 'thisMonth':
      return {
        from: dayOf(new Date(year, month, 1)),
        to: dayOf(new Date(year, month + 1, 0)),
      };
    case 'lastMonth':
      return {
        from: dayOf(new Date(year, month - 1, 1)),
        to: dayOf(new Date(year, month, 0)),
      };
    case 'thisQuarter': {
      const first = month - (month % 3);
      return {
        from: dayOf(new Date(year, first, 1)),
        to: dayOf(new Date(year, first + 3, 0)),
      };
    }
    case 'thisYear':
      return {
        from: dayOf(new Date(year, 0, 1)),
        to: dayOf(new Date(year, 11, 31)),
      };
  }
}

function add(path: string, params: Record<string, string | undefined>): string {
  const given = Object.entries(params).filter(
    (entry): entry is [string, string] => Boolean(entry[1]),
  );
  if (given.length === 0) return path;
  const query = new URLSearchParams(given).toString();
  return `${path}${path.includes('?') ? '&' : '?'}${query}`;
}

/** A list of calendar days: the days as they are. */
export function withDays(path: string, range: DayRange): string {
  return add(path, { from: range.from, to: range.to });
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

  return add(path, {
    from: range.from ? start(range.from).toISOString() : undefined,
    until: until?.toISOString(),
  });
}
