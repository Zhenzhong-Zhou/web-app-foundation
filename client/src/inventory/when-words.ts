import type { IntlShape } from 'react-intl';

import type { DayRange } from '../lib/date-range';
import { formatDay, formatDayRange } from '../lib/format';

/**
 * A range's days in words, an open one by its one end: "from Nov 1,
 * 2026", "until Nov 15, 2026", and both by Intl's range in the reader's
 * language, "Nov 1 – 15, 2026", the year once when it is one (review 49;
 * review 1's polish). Lower case, for the middle of a sentence; a label
 * capitalises its first letter.
 */
export function rangeWords(range: DayRange, intl: IntlShape): string {
  return intl.formatMessage(
    {
      id: 'inventory.movements.days',
      defaultMessage:
        '{from, select, none {until {until}} other {{until, select, none {from {from}} other {{range}}}}}',
    },
    {
      from: range.from ? formatDay(range.from) : 'none',
      until: range.to ? formatDay(range.to) : 'none',
      range: range.from && range.to ? formatDayRange(range.from, range.to) : '',
    },
  );
}
