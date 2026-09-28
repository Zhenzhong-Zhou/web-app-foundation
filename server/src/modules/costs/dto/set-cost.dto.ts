import { IsOptional, IsString, Matches } from 'class-validator';

import { NON_NEGATIVE_DECIMAL } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
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
  @Matches(NON_NEGATIVE_DECIMAL, {
    message:
      'unitPrice must be zero or more with at most 4 decimal places, sent as a string',
  })
  unitPrice!: string;

  @trim()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;

  @IsOptional()
  @IsString()
  @Matches(EXCHANGE_RATE, {
    message:
      'exchangeRate must be greater than zero with at most 8 decimal places, sent as a string',
  })
  exchangeRate?: string;
}
