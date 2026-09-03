import {
  IsBoolean,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * The first variant, created with the product. ADR-023 requires every product
 * to have at least one, so this is not optional — a product with no variant is
 * a row nothing can ever be counted against.
 */
export class CreateVariantDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku!: string;

  /** Null for a product with no variation; the UI omits the field entirely. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  @IsOptional()
  @IsBoolean()
  tracksBatches?: boolean;

  // Base units only. A client sending pounds converts before posting, or the
  // server would need the unit alongside every value — see the open decision.
  @IsOptional()
  @IsInt()
  @IsPositive()
  weightGrams?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  lengthMm?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  widthMm?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  heightMm?: number;

  @IsOptional()
  @IsInt()
  @IsPositive()
  caseQuantity?: number;
}
