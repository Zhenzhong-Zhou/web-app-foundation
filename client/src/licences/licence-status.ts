import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';
import type { ProductLicence } from '../lib/types';

const WORDS = defineMessages({
  withdrawn: { id: 'licences.status.withdrawn', defaultMessage: 'Withdrawn' },
  current: { id: 'licences.status.current', defaultMessage: 'Current' },
  expired: { id: 'licences.status.expired', defaultMessage: 'Expired' },
  expiresToday: {
    id: 'licences.status.expiresToday',
    defaultMessage: 'Expires today',
  },
});

/**
 * The same UTC reading as formatDay, in the reader's language (ADR-054),
 * through the shared intl object rather than lib/format, to avoid a cycle.
 */
function day(value: string): string {
  return intl().formatDate(new Date(value), {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}

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
 * Compared as days against today's UTC day, as the server compares them at
 * release (ADR-050, ADR-052): the two must agree, or the page and release
 * would disagree about a licence near midnight. The dates are YYYY-MM-DD.
 */
export function licenceStatus(licence: ProductLicence): LicenceStatus {
  if (!licence.isActive) {
    return {
      label: intl().formatMessage(WORDS.withdrawn),
      usable: false,
      tone: 'default',
    };
  }

  // Issued from a future date: a renewal or a transfer that takes effect at
  // the start of a period. Recordable now, not usable until then.
  if (licence.issuedAt && daysUntil(licence.issuedAt) > 0) {
    return {
      label: intl().formatMessage(
        {
          id: 'licences.status.inForceFrom',
          defaultMessage: 'In force from {day}',
        },
        { day: day(licence.issuedAt) },
      ),
      usable: false,
      tone: 'warning',
    };
  }

  if (!licence.expiresAt) {
    return {
      label: intl().formatMessage(WORDS.current),
      usable: true,
      tone: 'success',
    };
  }

  const days = daysUntil(licence.expiresAt);

  if (days < 0) {
    return {
      label: intl().formatMessage(WORDS.expired),
      usable: false,
      tone: 'default',
    };
  }

  if (days <= SOON_DAYS) {
    return {
      label:
        days === 0
          ? intl().formatMessage(WORDS.expiresToday)
          : intl().formatMessage(
              {
                id: 'licences.status.expiresIn',
                defaultMessage:
                  'Expires in {days, plural, one {# day} other {# days}}',
              },
              { days },
            ),
      usable: true,
      tone: 'warning',
    };
  }

  return {
    label: intl().formatMessage(WORDS.current),
    usable: true,
    tone: 'success',
  };
}

/** Days from today's UTC day; `new Date('2026-10-10')` is UTC midnight. */
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
