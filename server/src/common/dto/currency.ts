import { Matches } from 'class-validator';

/**
 * An ISO 4217 code: three capital letters (ADR-035, ADR-048). The validator
 * half of the rule; `isCurrencyCode` in database/schema/columns.ts is the
 * check-constraint half, and the two must say the same thing.
 *
 * Capitals only, not uppercased here: the client uppercases as it is typed,
 * so a lowercase code reaching the API is a caller's mistake worth a 400.
 *
 * `$property` names the field that failed, so `currency` and `baseCurrency`
 * get the same sentence about themselves.
 */
export const CURRENCY_CODE = /^[A-Z]{3}$/;

export const IsCurrencyCode = () =>
  Matches(CURRENCY_CODE, {
    message: '$property must be a 3-letter ISO code',
  });
