import type { IntlShape } from 'react-intl';

import type { ExpiryKind } from '../lib/api-names';
import { formatDay } from '../lib/format';

/**
 * A lot's expiry as the screens word it, the one place they do (ADR-094,
 * D2), with `ExpiryChip` for a column of them: a day, not known yet,
 * which reads "Expiry to add" and never "No expiry" (R9), or none. Its
 * kind is required, null where a read has none, when a lot with no day
 * reads as one that does not expire, as every lot did before (review 55).
 */
type ExpiringLot = {
  expiresAt: string | null;
  expiry: ExpiryKind | null;
};

/**
 * Beside a lot's code in a list of its lots, "Expires Oct 1, 2026",
 * "Expiry to add" or "No expiry": LotFields' options, Count it in's One
 * of its lots, the top bar's lookup (review 51).
 */
export function lotExpiry(lot: ExpiringLot, intl: IntlShape): string {
  if (lot.expiry === 'unknown') {
    return intl.formatMessage({
      id: 'inventory.lot.expiryToAdd',
      defaultMessage: 'Expiry to add',
    });
  }
  return lot.expiresAt
    ? intl.formatMessage(
        { id: 'inventory.lot.expiresOn', defaultMessage: 'Expires {day}' },
        { day: formatDay(lot.expiresAt) },
      )
    : intl.formatMessage({
        id: 'inventory.lot.noExpiry',
        defaultMessage: 'No expiry',
      });
}

/**
 * The same as a part of a longer line, "expires Oct 1, 2026" or "expiry
 * to add"; null for a lot that does not expire, which such a line leaves
 * unsaid: the lot's page under its title, Movements' find box, the lots
 * Ship and Release will take, Record output's batch.
 */
export function lotExpiryPart(
  lot: ExpiringLot,
  intl: IntlShape,
): string | null {
  if (lot.expiry === 'unknown') {
    return intl.formatMessage({
      id: 'inventory.lot.expiryToAddPart',
      defaultMessage: 'expiry to add',
    });
  }
  return lot.expiresAt
    ? intl.formatMessage(
        { id: 'inventory.trace.expires', defaultMessage: 'expires {day}' },
        { day: formatDay(lot.expiresAt) },
      )
    : null;
}
