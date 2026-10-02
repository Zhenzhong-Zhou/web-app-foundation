import {
  IsBooleanString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { KeysetQueryDto } from '../../../common/dto/keyset-query.dto';

/** The stock list's filters, and its page (ADR-051). */
export class ListStockDto extends KeysetQueryDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsBooleanString()
  includeEmpty?: string;

  /** Anywhere in the SKU, the product name or the lot code. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
