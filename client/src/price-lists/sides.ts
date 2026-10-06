import { defineMessages } from 'react-intl';

import { intl } from '../i18n/intl';

const SIDES = defineMessages({
  sale: { id: 'priceLists.side.sale', defaultMessage: 'Sale' },
  purchase: { id: 'priceLists.side.purchase', defaultMessage: 'Purchase' },
});

/** Which side of trade a list prices, by name in the reader's language. */
export function sideLabel(direction: 'sale' | 'purchase'): string {
  return intl().formatMessage(SIDES[direction]);
}
