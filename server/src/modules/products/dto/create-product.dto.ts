import { Type } from 'class-transformer';
import {
  IsDefined,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { PRODUCT_TYPES, type ProductType } from '../../../database/schema';
import { CreateVariantDto } from './create-variant.dto';

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

  /** Its category (ADR-092); omitted or null for Uncategorised. */
  @IsOptional()
  @IsUUID()
  categoryId?: string | null;

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
