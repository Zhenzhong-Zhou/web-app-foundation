import type { IntlShape } from 'react-intl';

/**
 * A code a lot had before, in words: "was ASH-06O1", 原编码 ASH-06O1, as a
 * changed item code reads on Movements (ADR-094 amended, R9). Under a
 * lot's code (FormerCodeLine), beside its page's title, and in the
 * lookup's and Movements' find for a lot found by it (review 60).
 */
export function wasCode(code: string, intl: IntlShape): string {
  return intl.formatMessage(
    { id: 'inventory.movements.was', defaultMessage: 'was {code}' },
    { code },
  );
}
