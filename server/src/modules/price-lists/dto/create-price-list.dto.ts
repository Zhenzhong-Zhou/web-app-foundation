import { IsIn, IsString, Matches, MaxLength, MinLength } from 'class-validator';

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
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
  currency!: string;
}
