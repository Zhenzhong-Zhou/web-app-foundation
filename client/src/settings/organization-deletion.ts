import type { IntlShape } from 'react-intl';

import type { OrganizationLastExport } from '../api/types.gen';
import { daysUntil } from '../lib/expiry';
import { formatDay } from '../lib/format';

/**
 * What the screens of an organization's deletion share (ADR-070): the
 * export's freshness, the day with its days left, and the address the
 * export downloads from.
 */

/** The export route, followed as a plain link: the ZIP goes to disk. */
export const EXPORT_PATH = '/organization/export';

/** As the server counts it: a deletion needs an export this recent. */
const FRESH_MS = 24 * 60 * 60 * 1000;

/** Whether the last export is recent enough to delete on. */
export function isFresh(
  last: OrganizationLastExport | null,
  now: Date = new Date(),
): boolean {
  return (
    last !== null &&
    now.getTime() - new Date(last.exportedAt).getTime() < FRESH_MS
  );
}

/**
 * "14 Nov 2026 (in 30 days)": the day as the email names it, unconverted
 * (ADR-052), and how far off it is, as expiry reads in days left (ADR-055).
 */
export function dayWithDaysLeft(intl: IntlShape, day: string): string {
  return intl.formatMessage(
    {
      id: 'settings.deletion.dayWithDaysLeft',
      defaultMessage:
        '{date} ({days, plural, =0 {today} one {in # day} other {in # days}})',
    },
    { date: formatDay(day), days: Math.max(0, daysUntil(day)) },
  );
}

/**
 * The day a deletion asked for now would be set to, as the server sets it:
 * 30 days ahead, as a UTC calendar day (ADR-069). The dialog names it
 * before the request is made.
 */
export function deletionDayFrom(now: Date): string {
  return new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** From 7 days before the day, the banner can no longer be hidden. */
export const LAST_DAYS = 7;
