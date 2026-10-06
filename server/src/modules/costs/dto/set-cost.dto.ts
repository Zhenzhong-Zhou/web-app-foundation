import { IsOptional, IsString, Matches } from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import { IsNonNegativeDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
import { defineMessage, rule } from '../../../i18n/validation';
import { EXCHANGE_RATE } from './set-exchange-rate.dto';

/**
 * What one acquisition cost (ADR-048): a receipt, an inbound adjustment or
 * an opening balance.
 *
 * Sent whole, as a PUT says: the price and its currency together, since a
 * price with no currency is a number with no unit (ADR-035). The rate is
 * optional — without it, the latest on file on or before the day the stock
 * arrived is used, and the request is refused if there is none.
 */
export class SetCostDto {
  /** Zero is a price: a free replacement is real (ADR-035). */
  @IsString()
  @IsNonNegativeDecimal()
  unitPrice!: string;

  @trim()
  @IsString()
  @IsCurrencyCode()
  currency!: string;

  @IsOptional()
  @IsString()
  @Matches(EXCHANGE_RATE, {
    message: rule(
      defineMessage({
        id: 'validation.exchangeRate',
        defaultMessage:
          'exchangeRate must be greater than zero with at most 8 decimal places, sent as a string',
      }),
    ),
  })
  exchangeRate?: string;
}
