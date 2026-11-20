import type { IntlShape } from 'react-intl';

import { isZero } from '../lib/decimal';
import { displayQuantity } from '../lib/format';

/** A code's not-usable parts, as `codeFigures` gives them (ADR-093). */
type NotUsableParts = {
  notUsable: string;
  expired: string;
  issued: string;
  unavailable: string;
};

/**
 * "12 not usable: expired, at a place not available": why some of On hand
 * is not usable, each part named once. Where it stands and Stock's phone
 * card say it in these words (#612).
 */
export function notUsableWhy(parts: NotUsableParts, intl: IntlShape): string {
  const reasons = [
    !isZero(parts.expired) &&
      intl.formatMessage({
        id: 'products.stock.reason.expired',
        defaultMessage: 'expired',
      }),
    !isZero(parts.issued) &&
      intl.formatMessage({
        id: 'products.stock.reason.issued',
        defaultMessage: 'issued to a run',
      }),
    !isZero(parts.unavailable) &&
      intl.formatMessage({
        id: 'products.stock.reason.unavailable',
        defaultMessage: 'at a place not available',
      }),
  ].filter((reason): reason is string => !!reason);

  return intl.formatMessage(
    {
      id: 'products.stock.notUsableWhy',
      defaultMessage: '{quantity} not usable: {reasons}',
    },
    {
      quantity: displayQuantity(parts.notUsable),
      reasons: intl.formatList(reasons, { type: 'conjunction' }),
    },
  );
}
