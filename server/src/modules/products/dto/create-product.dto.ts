import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
  IsDefined,
  IsIn,
  IsInt,
  IsOptional,
  IsPositive,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { PRODUCT_TYPES, type ProductType } from '../../../database/schema';

const trim = () =>
  Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  );

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

export class CreateProductDto {
  @IsIn(PRODUCT_TYPES)
  type!: ProductType;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(2000)
  description?: string;

  /**
   * Required, and `@IsDefined()` is what makes it so: `@ValidateNested()`
   * passes silently on undefined — it validates what is there, not that
   * anything is. Without it the spread produces an empty insert and the
   * not-null on sku surfaces as a 500.
   *
   * The product and its first variant are created in one transaction, because
   * a product that briefly exists without one is a state no query knows how to
   * read (ADR-023).
   */
  @IsDefined()
  @ValidateNested()
  @Type(() => CreateVariantDto)
  variant!: CreateVariantDto;
}
