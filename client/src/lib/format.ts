const RELATIVE = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' });

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 365 * 24 * 60 * 60_000],
  ['month', 30 * 24 * 60 * 60_000],
  ['day', 24 * 60 * 60_000],
  ['hour', 60 * 60_000],
  ['minute', 60_000],
];

/**
 * "2 hours ago". Intl rather than a date library — this is the only place a
 * relative time is needed, and adding one for it would cost more than it
 * saves.
 *
 * Note last_seen_at is throttled to one write a minute server-side, so
 * "just now" can be up to a minute stale. Fine for this display.
 */
export function relativeTime(value: string | Date): string {
  const elapsed = new Date(value).getTime() - Date.now();

  for (const [unit, ms] of UNITS) {
    if (Math.abs(elapsed) >= ms) {
      return RELATIVE.format(Math.round(elapsed / ms), unit);
    }
  }

  return 'just now';
}

const DATE = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/**
 * "12 Sep 2026". Absolute rather than relative, unlike relativeTime above: a
 * delivery three weeks out reads as noise as "in 21 days", and someone
 * planning a dock wants the date.
 *
 * Rendered in the browser's timezone. Correct for timestamps; slightly wrong
 * for expected_at, which is a calendar day stored as timestamptz and can show
 * as the previous day in another timezone. A non-issue for one timezone, and
 * a `date` column if that ever changes.
 */
export function formatDate(value: string | Date): string {
  return DATE.format(new Date(value));
}
