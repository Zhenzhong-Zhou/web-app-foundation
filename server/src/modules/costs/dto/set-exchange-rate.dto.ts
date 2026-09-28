import { IsISO8601, IsString, Matches } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Greater than zero, up to 10 digits before the point and 8 after, matching
 * numeric(18, 8). A string, never a JSON number, for ADR-025's reason.
 */
export const EXCHANGE_RATE = /^(?=.*[1-9])\d{1,10}(\.\d{1,8})?$/;

/** One currency's rate into the base currency, for one day (ADR-048). */
export class SetExchangeRateDto {
  @trim()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  /**
   * A calendar day, YYYY-MM-DD, as invoices take one (ADR-046). Checked as a
   * real date too: the pattern alone accepts 2026-02-31.
   */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'rateDate must be YYYY-MM-DD' })
  @IsISO8601({ strict: true }, { message: 'rateDate must be a real date' })
  rateDate!: string;

  @IsString()
  @Matches(EXCHANGE_RATE, {
    message:
      'rate must be greater than zero with at most 8 decimal places, sent as a string',
  })
  rate!: string;
}
