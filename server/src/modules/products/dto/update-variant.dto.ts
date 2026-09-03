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
 * SKU is editable. Locking it after first use sounds safer and is worse: a
 * typo found after the first receipt becomes permanent, and the workaround is
 * a duplicate product with the old one discontinued — which splits stock and
 * loses the history the lock was protecting (ADR-023).
 *
 * tracksBatches is absent. Flipping it on a variant that already has stock
 * would leave existing rows violating the invariant in both directions: turned
 * on, every current row has a null batch_id; turned off, they all have one.
 * Reconciling that is a data migration, not a PATCH.
 */
export class UpdateVariantDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  sku?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  unitOfMeasure?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

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
