import { IsString } from 'class-validator';

import { IsNonNegativeDecimal } from '../../../common/dto/decimal';

/** One item's price on a list: per unit, net of tax, in the list's currency. */
export class SetPriceListItemDto {
  @IsString()
  @IsNonNegativeDecimal()
  unitPrice!: string;
}
