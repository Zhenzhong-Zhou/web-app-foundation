import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
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

  /**
   * Only lots expiring within this many days, the expired included: the
   * inventory's "Expiring soon" (ADR-055). Untracked stock has no expiry
   * and never matches. Counted from the database's today.
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiringWithin?: number;

  /**
   * Only stock whose cost is still waiting (ADR-048): received with no
   * price, or a batch whose run has not closed. The inventory's "Needs a
   * cost" (ADR-055), meaning exactly what Stock value lists.
   */
  @IsOptional()
  @IsBooleanString()
  needsCost?: string;
}
