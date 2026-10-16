/**
 * Calendar days in a time zone (ADR-052, ADR-072): what day it is, and what
 * day a moment fell on, as YYYY-MM-DD.
 *
 * The one place the server answers either question. An organization's own
 * zone decides its day (ADR-072): from 4 or 5 pm in Vancouver, the UTC day
 * is already tomorrow. The cutoffs that must hold for everyone, wherever
 * they are, ask for 'UTC' by name (ADR-069, ADR-070).
 *
 * All of it in TypeScript, never in SQL: Node and Postgres each carry their
 * own copy of the time-zone rules, and asking only one means the two can
 * never disagree about a day. A query that needs a day is given it.
 *
 * Strings rather than Dates: two YYYY-MM-DD strings compare as days, and a
 * `date` column takes one as it is. `now` is a parameter so a test can pin
 * the clock either side of midnight.
 */

/** One formatter per zone, made once: building one is the slow part. */
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat('en-US', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
    formatters.set(timeZone, formatter);
  }
  return formatter;
}

/** The calendar day a moment falls on in a time zone, YYYY-MM-DD. */
export function dayIn(timeZone: string, moment: Date | string): string {
  const parts = formatterFor(timeZone).formatToParts(new Date(moment));
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/** Today in a time zone, YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  return dayIn(timeZone, now);
}

/**
 * An IANA name: letters first, then letters, digits, `_`, `+`, `-` and
 * `/`. What this refuses is an offset such as `+05:00` or `-0800`, which
 * Intl accepts as a zone too: an offset is wrong for half the year
 * wherever clocks change (ADR-072).
 */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * The zone's canonical name, as stored (`America/Vancouver`), or null when
 * it is not a zone the server knows. Aliases come back under the name the
 * time-zone database prefers, so one zone is never stored two ways.
 */
export function canonicalTimeZone(name: string): string | null {
  if (!ZONE_NAME.test(name)) return null;
  try {
    return new Intl.DateTimeFormat('en-US', {
      timeZone: name,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }
}
