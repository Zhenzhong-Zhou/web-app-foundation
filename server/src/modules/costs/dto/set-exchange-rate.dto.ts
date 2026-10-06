import { IsString, Matches } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { IsCurrencyCode } from '../../../common/dto/currency';
import { trim } from '../../../common/dto/trim';
import { defineMessage, rule } from '../../../i18n/validation';

/**
 * Greater than zero, up to 10 digits before the point and 8 after, matching
 * numeric(18, 8). A string, never a JSON number, for ADR-025's reason.
 */
export const EXCHANGE_RATE = /^(?=.*[1-9])\d{1,10}(\.\d{1,8})?$/;

/** One currency's rate into the base currency, for one day (ADR-048). */
export class SetExchangeRateDto {
  @trim()
  @IsString()
  @IsCurrencyCode()
  currency!: string;

  /**
   * A calendar day, YYYY-MM-DD, as invoices take one (ADR-046). Checked as a
   * real date too: the pattern alone accepts 2026-02-31.
   */
  @IsCalendarDay()
  rateDate!: string;

  @IsString()
  @Matches(EXCHANGE_RATE, {
    message: rule(
      defineMessage({
        id: 'validation.rate',
        defaultMessage:
          'rate must be greater than zero with at most 8 decimal places, sent as a string',
      }),
    ),
  })
  rate!: string;
}
