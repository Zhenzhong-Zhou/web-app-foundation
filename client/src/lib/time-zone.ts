import type { CalendarDay } from './api-names';
import { cached } from './format';

/**
 * Time zones on the client (ADR-072): the organization's day, and how a
 * zone is named and found.
 *
 * The organization's zone decides its day: what Home counts as today, days
 * left on a lot or a licence, the date presets. Moments on screen stay in
 * the reader's own zone. The session says which zone it is; the auth
 * provider passes it here as it renders, as the language provider passes
 * the formatting locale, so a plain function can read it.
 */

let organizationZone: string | null = null;

/** Set from the session; null signed out, or with no organization. */
export function setOrganizationTimeZone(zone: string | null): void {
  organizationZone = zone;
}

/** This device's own zone, as the browser reports it. */
export function browserTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone;
}

/** The organization's zone, or this device's before there is one. */
export function organizationTimeZone(): string {
  return organizationZone ?? browserTimeZone();
}

/** Today in a zone, YYYY-MM-DD. */
export function todayIn(zone: string, now: Date = new Date()): CalendarDay {
  const parts = cached(
    `zone-day:${zone}`,
    () =>
      new Intl.DateTimeFormat('en-US', {
        timeZone: zone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }),
  ).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((each) => each.type === type)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

/**
 * The organization's today (ADR-072): the day its licences, Home and new
 * documents go by, wherever the reader is.
 */
export function organizationToday(now: Date = new Date()): CalendarDay {
  return todayIn(organizationTimeZone(), now);
}

/** Minutes ahead of UTC in a zone at a moment: 480 in Shanghai. */
export function offsetMinutes(zone: string, now: Date = new Date()): number {
  const name =
    cached(
      `zone-offset:${zone}`,
      () =>
        new Intl.DateTimeFormat('en-US', {
          timeZone: zone,
          timeZoneName: 'longOffset',
        }),
    )
      .formatToParts(now)
      .find((part) => part.type === 'timeZoneName')?.value ?? 'GMT';
  const match = /GMT([+-])(\d{2}):(\d{2})/.exec(name);
  if (!match) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

/** "UTC−7", "UTC+5:30", "UTC+0": a zone's offset now, as people write it. */
export function offsetLabel(zone: string, now: Date = new Date()): string {
  const minutes = offsetMinutes(zone, now);
  const sign = minutes < 0 ? '\u2212' : '+';
  const hours = Math.floor(Math.abs(minutes) / 60);
  const rest = Math.abs(minutes) % 60;
  return `UTC${sign}${hours}${rest ? `:${String(rest).padStart(2, '0')}` : ''}`;
}

/** The place in a zone's name: America/Los_Angeles → "Los Angeles". */
export function cityOf(zone: string): string {
  return (zone.split('/').pop() ?? zone).replace(/_/g, ' ');
}

/**
 * The zone's own name in a language, "Pacific Time", "中国标准时间", as
 * the browser knows it. Browsers translate zone names but not cities, so
 * the city beside it stays as the zone's standard name spells it.
 */
export function zoneName(zone: string, locale: string): string {
  try {
    return (
      cached(
        `zone-name:${locale}:${zone}`,
        () =>
          new Intl.DateTimeFormat(locale, {
            timeZone: zone,
            timeZoneName: 'longGeneric',
          }),
      )
        .formatToParts(new Date())
        .find((part) => part.type === 'timeZoneName')?.value ?? zone
    );
  } catch {
    return zone;
  }
}

/**
 * A zone the server takes (ADR-072): UTC, or a place, one of the time-zone
 * database's areas then its city. Safari also lists `Etc/GMT+8` and the
 * like, offsets under another name, which the server refuses.
 */
export function isPlaceOrUtc(zone: string): boolean {
  return (
    zone === 'UTC' ||
    /^(Africa|America|Antarctica|Arctic|Asia|Atlantic|Australia|Europe|Indian|Pacific)\//.test(
      zone,
    )
  );
}

/**
 * Every zone the browser knows that the server takes, UTC included, by
 * offset now and then name.
 */
export function allTimeZones(now: Date = new Date()): string[] {
  const zones = new Set(Intl.supportedValuesOf('timeZone'));
  zones.add('UTC');
  // Each offset read once, not once per comparison.
  return [...zones]
    .filter(isPlaceOrUtc)
    .map((zone) => ({ zone, minutes: offsetMinutes(zone, now) }))
    .sort((a, b) => a.minutes - b.minutes || a.zone.localeCompare(b.zone))
    .map(({ zone }) => zone);
}

/** A zone under the name this browser gives it, or as given if unknown. */
function asThisBrowserNamesIt(zone: string): string {
  try {
    return cached(
      `zone-as-named:${zone}`,
      () => new Intl.DateTimeFormat('en-US', { timeZone: zone }),
    ).resolvedOptions().timeZone;
  } catch {
    return zone;
  }
}

/**
 * Whether two names are one zone to this browser: the server stores
 * `Asia/Kolkata`, which Chrome lists as `Asia/Calcutta` (ADR-072).
 */
export function sameZone(a: string, b: string): boolean {
  return a === b || asThisBrowserNamesIt(a) === asThisBrowserNamesIt(b);
}

/**
 * Whether a zone is on another clock than this device right now: the
 * case where Home says which zone its dates follow (ADR-072).
 */
export function differsFromBrowser(
  zone: string,
  now: Date = new Date(),
): boolean {
  return offsetMinutes(zone, now) !== offsetMinutes(browserTimeZone(), now);
}
