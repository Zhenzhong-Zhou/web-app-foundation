import { IsString, Matches } from 'class-validator';

import { NON_NEGATIVE_DECIMAL } from '../../../common/dto/decimal';

/** One item's price on a list: per unit, net of tax, in the list's currency. */
export class SetPriceListItemDto {
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, {
    message:
      'unitPrice must be zero or more with at most 4 decimal places, sent as a string',
  })
  unitPrice!: string;
}
