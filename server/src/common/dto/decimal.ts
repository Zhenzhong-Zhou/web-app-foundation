import { Matches } from 'class-validator';

import { defineMessage, rule } from '../../i18n/validation';

/**
 * Quantities and prices arrive as strings, never JSON numbers (ADR-025): a
 * JSON number has already been through a double before any validator sees
 * it. Up to 14 digits before the point and 4 after, matching numeric(18, 4).
 *
 * One copy, so a change to the rule lands in every DTO at once.
 */

/** Greater than zero — a quantity. Ordering 2.75 kg of raw material is ordinary. */
export const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

/** Zero or more — a price. A free replacement line is real (ADR-035). */
export const NON_NEGATIVE_DECIMAL = /^\d{1,14}(\.\d{1,4})?$/;

/**
 * The two rules as validators, each with the sentence that states it.
 * `$property` names the field, so every quantity and price gets the same
 * sentence about itself, and a change to the rule changes what it says
 * everywhere too.
 */
export const IsPositiveDecimal = () =>
  Matches(POSITIVE_DECIMAL, {
    message: rule(
      defineMessage({
        id: 'validation.positiveDecimal',
        defaultMessage:
          '{property} must be a positive number with at most 4 decimal places, sent as a string',
      }),
    ),
  });

export const IsNonNegativeDecimal = () =>
  Matches(NON_NEGATIVE_DECIMAL, {
    message: rule(
      defineMessage({
        id: 'validation.nonNegativeDecimal',
        defaultMessage:
          '{property} must be zero or more with at most 4 decimal places, sent as a string',
      }),
    ),
  });
