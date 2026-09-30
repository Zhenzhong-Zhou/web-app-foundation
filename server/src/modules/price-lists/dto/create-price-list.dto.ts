import { IsIn, IsString, MaxLength, MinLength } from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import { trim } from '../../../common/dto/trim';
import {
  PRICE_LIST_DIRECTIONS,
  type PriceListDirection,
} from '../../../database/schema';

/**
 * A new list (ADR-049). Direction and currency are chosen here and never
 * changed: either would reinterpret every price already on the list.
 */
export class CreatePriceListDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @IsIn(PRICE_LIST_DIRECTIONS)
  direction!: PriceListDirection;

  @trim()
  @IsString()
  @IsCurrencyCode()
  currency!: string;
}
