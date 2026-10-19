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

import { Logger } from '@nestjs/common';

const logger = new Logger('TimeZone');

/** One formatter per zone, made once: building one is the slow part. */
const formatters = new Map<string, Intl.DateTimeFormat>();

const dayFormatter = (timeZone: string) =>
  new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

/**
 * A stored zone this server cannot read, written by hand or dropped by a
 * newer time-zone database, decides its days in UTC and says so once,
 * rather than failing every request, or the reminder run that reads every
 * organization's zone in turn.
 */
function formatterFor(timeZone: string): Intl.DateTimeFormat {
  let formatter = formatters.get(timeZone);
  if (!formatter) {
    try {
      formatter = dayFormatter(timeZone);
    } catch {
      logger.warn(
        `${timeZone} is not a time zone this server can read; its days are UTC's until it is set again (ADR-072).`,
      );
      formatter = dayFormatter('UTC');
    }
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

/** A calendar day so many days on (or back, when negative), YYYY-MM-DD. */
export function addDays(day: string, days: number): string {
  const date = new Date(`${day}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

/**
 * The moment a calendar day begins in a time zone: its midnight, or its
 * first moment where the clocks skip midnight. What a day-long period
 * ends at, an invitation's link for one (ADR-077).
 */
export function startOfDayIn(timeZone: string, day: string): Date {
  const midnight = Date.parse(`${day}T00:00:00.000Z`);
  // The zone's offset at a guess, applied, then asked again at the answer:
  // the second pass corrects a guess made on the other side of a change.
  let moment = midnight;
  for (let pass = 0; pass < 2; pass += 1) {
    moment = midnight - offsetIn(timeZone, new Date(moment));
  }
  // A day whose midnight never happens starts at its first hour that does.
  while (dayIn(timeZone, new Date(moment)) < day) moment += 60 * 60 * 1000;
  return new Date(moment);
}

/** How far ahead of UTC a zone's clocks are at a moment, in milliseconds. */
function offsetIn(timeZone: string, moment: Date): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(moment);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((each) => each.type === type)?.value ?? 0);
  const wall = Date.UTC(
    part('year'),
    part('month') - 1,
    part('day'),
    part('hour'),
    part('minute'),
    part('second'),
  );
  return wall - Math.floor(moment.getTime() / 1000) * 1000;
}

/**
 * An IANA name: letters first, then letters, digits, `_`, `+`, `-` and
 * `/`. What this refuses is an offset such as `+05:00` or `-0800`, which
 * Intl accepts as a zone too: an offset is wrong for half the year
 * wherever clocks change (ADR-072).
 */
const ZONE_NAME = /^[A-Za-z][A-Za-z0-9_+-]*(\/[A-Za-z0-9_+-]+)*$/;

/**
 * A place: one of the time-zone database's areas, then its city. What this
 * leaves out are offsets under other names, `Etc/GMT+8` and the
 * abbreviations: `EST` is Panama's zone to Intl, a year without daylight
 * saving that someone in New York did not mean.
 */
const AREA_CITY =
  /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\/[A-Za-z0-9_+-]+(\/[A-Za-z0-9_+-]+)*$/;

/**
 * Node's ICU answers with CLDR's names, some of them ones the time-zone
 * database has since replaced: Calcutta for Kolkata, Kiev for Kyiv. A
 * browser whose list holds only the current name, Safari's, would find
 * nothing to select, and every screen would name the old city. Each one
 * Node 26 returns, from the zones Safari lists that Node names otherwise.
 * The client keeps the same table for the names Chrome lists
 * (client/src/lib/time-zone.ts): a change to one is a change to both.
 */
const CURRENT_NAMES: Readonly<Record<string, string>> = {
  'Africa/Asmera': 'Africa/Asmara',
  'America/Buenos_Aires': 'America/Argentina/Buenos_Aires',
  'America/Catamarca': 'America/Argentina/Catamarca',
  'America/Coral_Harbour': 'America/Atikokan',
  'America/Cordoba': 'America/Argentina/Cordoba',
  'America/Godthab': 'America/Nuuk',
  'America/Indianapolis': 'America/Indiana/Indianapolis',
  'America/Jujuy': 'America/Argentina/Jujuy',
  'America/Louisville': 'America/Kentucky/Louisville',
  'America/Mendoza': 'America/Argentina/Mendoza',
  'Asia/Calcutta': 'Asia/Kolkata',
  'Asia/Katmandu': 'Asia/Kathmandu',
  'Asia/Rangoon': 'Asia/Yangon',
  'Asia/Saigon': 'Asia/Ho_Chi_Minh',
  'Atlantic/Faeroe': 'Atlantic/Faroe',
  'Europe/Kiev': 'Europe/Kyiv',
  'Pacific/Enderbury': 'Pacific/Kanton',
  'Pacific/Ponape': 'Pacific/Pohnpei',
  'Pacific/Truk': 'Pacific/Chuuk',
};

/**
 * The zone's canonical name, as stored (`America/Vancouver`), or null when
 * it is not one the server takes: UTC, or a place it knows. Aliases come
 * back under the time-zone database's current name, `Asia/Kolkata` for
 * `Asia/Calcutta`, so one zone is never stored two ways.
 */
export function canonicalTimeZone(name: string): string | null {
  // The name as sent, too: `GMT` and `Etc/UTC` are UTC to Intl, and `EST`
  // comes back as a place, Panama.
  const place =
    ZONE_NAME.test(name) && name.includes('/') && !/^etc\//i.test(name);
  if (name.toUpperCase() !== 'UTC' && !place) return null;

  let resolved: string;
  try {
    resolved = new Intl.DateTimeFormat('en-US', {
      timeZone: name,
    }).resolvedOptions().timeZone;
  } catch {
    return null;
  }

  const current = CURRENT_NAMES[resolved] ?? resolved;
  return current === 'UTC' || AREA_CITY.test(current) ? current : null;
}
