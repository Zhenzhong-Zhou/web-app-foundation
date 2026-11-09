import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsOptional,
  IsUUID,
  ValidateNested,
} from 'class-validator';

import { defineMessage, rule } from '../../../i18n/validation';

/** At most this many items changed in one request (ADR-092). */
export const MAX_CHANGED_AT_ONCE = 500;

/**
 * One item's change in several at once (ADR-092): its new category, null
 * for Uncategorised, or whether it is in use, or both. A field left out
 * stays as it is.
 */
export class ProductChangeDto {
  @IsUUID()
  id!: string;

  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

const EACH_ITEM_ONCE = {
  message: rule(
    defineMessage({
      id: 'validation.itemTwice',
      defaultMessage: 'An item appears twice — send each one once',
    }),
  ),
};

/**
 * Several items changed at once (ADR-092), each its own way, so Undo sends
 * the answer back: each item's values before.
 */
export class ChangeProductsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(MAX_CHANGED_AT_ONCE)
  @ArrayUnique((change?: ProductChangeDto) => change?.id, EACH_ITEM_ONCE)
  @ValidateNested({ each: true })
  @Type(() => ProductChangeDto)
  items!: ProductChangeDto[];
}
