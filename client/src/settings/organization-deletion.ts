import type { IntlShape } from 'react-intl';

import type { OrganizationLastExport } from '../api/types.gen';
import { useLanguage } from '../i18n/use-language';
import { apiUrl } from '../lib/api';
import { daysUntil, localToday } from '../lib/expiry';
import { formatDay } from '../lib/format';

/**
 * What the screens of an organization's deletion share (ADR-070): the day
 * with its days left, and the address the export downloads from. Whether
 * an export is fresh, and whether the last week has begun, are the
 * server's to say.
 */

/** The export route, followed as a plain link: the ZIP goes to disk. */
const EXPORT_PATH = '/organization/export';

/**
 * The export's address, saying the language the app shows (ADR-071): the
 * README's glossary is written in it. A plain link cannot send the app's
 * Accept-Language, and the browser's may be another.
 */
export function useExportUrl(): string {
  const { locale } = useLanguage();
  return apiUrl(`${EXPORT_PATH}?locale=${encodeURIComponent(locale)}`);
}

/**
 * "14 Nov 2026 (in 30 days)": the day as the email names it, unconverted
 * (ADR-052), and how far off it is, as expiry reads in days left (ADR-055).
 * Counted from the reader's own day, not the organization's (ADR-072): a
 * deletion day ends everywhere, so each person counts to it by theirs.
 */
export function dayWithDaysLeft(
  intl: IntlShape,
  day: string,
  /** When the count is known exactly, as the 30 days of a new deletion. */
  days: number = Math.max(0, daysUntil(day, localToday())),
): string {
  return intl.formatMessage(
    {
      id: 'settings.deletion.dayWithDaysLeft',
      defaultMessage:
        '{date} ({days, plural, =0 {today} one {in # day} other {in # days}})',
    },
    { date: formatDay(day), days },
  );
}

/** How long a deletion waits (ADR-069, ADR-070). */
export const DELETION_DAYS = 30;

/**
 * The day a deletion asked for now would be set to, as the server sets it:
 * 30 days ahead, as a UTC calendar day (ADR-069). The dialog names it
 * before the request is made.
 */
export function deletionDayFrom(now: Date): string {
  return new Date(now.getTime() + DELETION_DAYS * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * Who took an export: "you", by id rather than by name, since two members
 * can share one; anyone else by their name. The dialog and the Profile
 * section say it the same way.
 */
export function exportedBy(
  intl: IntlShape,
  exported: OrganizationLastExport,
  userId: string | undefined,
): string {
  return exported.exportedById === userId
    ? intl.formatMessage({
        id: 'settings.deletion.byYou',
        defaultMessage: 'you',
      })
    : exported.exportedBy;
}
