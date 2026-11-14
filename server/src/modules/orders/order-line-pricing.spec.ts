import { ConflictException } from '@nestjs/common';

import { type Translatable, translate } from '../../i18n/translate';
import { assertOneSaleCurrency } from './order-line-pricing';

/** The refusal a sale in two currencies gives a price in a third. */
function refused(): Translatable {
  try {
    assertOneSaleCurrency(new Set(['USD', 'CAD']), 'MAGCAP-60', 'EUR');
  } catch (error) {
    expect(error).toBeInstanceOf(ConflictException);
    return (error as ConflictException).getResponse() as Translatable;
  }
  throw new Error('A third currency was allowed');
}

/**
 * A list in a refusal goes to t() as an array, and joinList joins it as
 * each language does, a Latin name spaced from 和 in Chinese (ADR-090),
 * never "CAD, USD" in every language.
 */
describe('assertOneSaleCurrency', () => {
  it('names the sale’s currencies as a list, in the reader’s language', () => {
    const message = refused();

    expect(message.message).toBe(
      'This sale is in CAD and USD, so MAGCAP-60 cannot be priced in EUR',
    );
    // The list alone, which a later review of the words leaves as it is.
    expect(translate(message, 'fr-CA')).toContain(' CAD et USD');
    expect(translate(message, 'zh-Hans')).toContain(' CAD 和 USD，');
  });
});
