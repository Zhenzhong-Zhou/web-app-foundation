import type { IntlShape } from 'react-intl';

import type { DayRange } from '../lib/date-range';
import { formatDay } from '../lib/format';

/**
 * A range's days in words, an open one by its one end: "from 1 Nov 2026",
 * "until 15 Nov 2026", "1 Nov 2026 – 15 Nov 2026" (review 49). Lower case,
 * for the middle of a sentence; a label capitalises its first letter.
 */
export function rangeWords(range: DayRange, intl: IntlShape): string {
  return intl.formatMessage(
    {
      id: 'inventory.movements.days',
      defaultMessage:
        '{from, select, none {until {until}} other {{until, select, none {from {from}} other {{from} – {until}}}}}',
    },
    {
      from: range.from ? formatDay(range.from) : 'none',
      until: range.to ? formatDay(range.to) : 'none',
    },
  );
}
