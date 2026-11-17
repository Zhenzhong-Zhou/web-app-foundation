import type { IntlShape } from 'react-intl';

import type { Delivery } from '../api/types.gen';
import { formatDay } from '../lib/format';
import { displayWithUnit } from '../products/units';

/** The answer to "Which delivery is this?" that carries on in the free dialog. */
export const NOT_ON_AN_ORDER = 'none';

/**
 * What is still to come on a delivery and when, as the question before
 * receiving and the order's Receive dialog both say it (ADR-093, v3):
 * "48 each still to come, expected 20 Nov 2026".
 */
export function stillToCome(delivery: Delivery, intl: IntlShape): string {
  const quantity = displayWithUnit(
    delivery.line.quantityOutstanding,
    delivery.line.unitOfMeasure,
    intl,
  );
  return delivery.expectedAt
    ? intl.formatMessage(
        {
          id: 'inventory.receive.comingBy',
          defaultMessage: '{quantity} still to come, expected {day}',
        },
        { quantity, day: formatDay(delivery.expectedAt) },
      )
    : intl.formatMessage(
        {
          id: 'inventory.receive.comingUndated',
          defaultMessage: '{quantity} still to come, no day set',
        },
        { quantity },
      );
}
