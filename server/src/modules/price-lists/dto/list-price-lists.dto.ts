import { IsIn, IsOptional } from 'class-validator';

import {
  PRICE_LIST_DIRECTIONS,
  type PriceListDirection,
} from '../../../database/schema';

export class ListPriceListsDto {
  /** The pickers ask for one side: a customer's lists, or a supplier's. */
  @IsOptional()
  @IsIn(PRICE_LIST_DIRECTIONS)
  direction?: PriceListDirection;
}
