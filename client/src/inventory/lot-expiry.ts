import type { IntlShape } from 'react-intl';

import type { Lot } from '../api/types.gen';
import { formatDay } from '../lib/format';

/**
 * A lot's expiry as a list of its lots says it beside its code, "Expires
 * Oct 1, 2026" or "No expiry": LotFields' options and Count it in's
 * One of its lots (review 51).
 */
export function lotExpiry(
  lot: Pick<Lot, 'expiresAt'>,
  intl: IntlShape,
): string {
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
