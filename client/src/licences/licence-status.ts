import type { ProductLicence } from '../lib/types';

/** The same UTC reading as formatDay, kept local to avoid a cycle. */
const DAY = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  timeZone: 'UTC',
});

/** How long before an expiry is worth saying out loud. */
const SOON_DAYS = 60;

export interface LicenceStatus {
  label: string;
  /** Whether it can still be put on a new recipe. */
  usable: boolean;
  tone: 'success' | 'warning' | 'default';
}

/**
 * What a licence's state is, derived rather than stored.
 *
 * `isActive` is a switch somebody has to remember to flip; a date passes on
 * its own. Deriving means a licence that lapsed last week reads as expired
 * without anyone doing anything, and the two are kept apart: withdrawn is a
 * decision, expired is the calendar.
 *
 * Compared as days in UTC, because the date is a calendar day written as UTC
 * midnight — read in a zone behind Greenwich it would expire a day early.
 */
export function licenceStatus(licence: ProductLicence): LicenceStatus {
  if (!licence.isActive) {
    return { label: 'Withdrawn', usable: false, tone: 'default' };
  }

  // Issued from a future date: a renewal or a transfer that takes effect at
  // the start of a period. Recordable now, not usable until then.
  if (licence.issuedAt && daysUntil(licence.issuedAt) > 0) {
    return {
      label: `In force from ${DAY.format(new Date(licence.issuedAt))}`,
      usable: false,
      tone: 'warning',
    };
  }

  if (!licence.expiresAt) {
    return { label: 'Current', usable: true, tone: 'success' };
  }

  const days = daysUntil(licence.expiresAt);

  if (days < 0) return { label: 'Expired', usable: false, tone: 'default' };

  if (days <= SOON_DAYS) {
    return {
      label: days === 0 ? 'Expires today' : `Expires in ${days} days`,
      usable: true,
      tone: 'warning',
    };
  }

  return { label: 'Current', usable: true, tone: 'success' };
}

function daysUntil(day: string): number {
  const MS = 24 * 60 * 60 * 1000;
  const now = new Date();

  const today = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
  );

  return Math.round((new Date(day).getTime() - today) / MS);
}
