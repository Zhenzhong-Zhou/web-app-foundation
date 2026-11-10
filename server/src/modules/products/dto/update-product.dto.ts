import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { PRODUCT_TYPES, type ProductType } from '../../../database/schema';

/**
 * Product-level fields only: the variants' are their own route's.
 */
export class UpdateProductDto {
  /**
   * Its type, changed at any time (ADR-092): the type forks nothing
   * (ADR-023), so its stock, lots and History stay as they are. Optional,
   * but never null: ValidateIf rather than IsOptional, which lets a null
   * through to the NOT NULL column as a 500.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  /** Left out to keep it; never null, as `type`. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  /** Emptied with "", as the form sends it; never null, as `type`. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsString()
  @MaxLength(2000)
  description?: string;

  /**
   * Discontinuing. Never cascaded to variants — see the service. Never
   * null, as `type`.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  isActive?: boolean;

  /** Moved to another category (ADR-092); null for Uncategorised. */
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;
}
