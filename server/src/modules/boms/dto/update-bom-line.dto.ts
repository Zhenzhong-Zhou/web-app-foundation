import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsPositiveDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

/**
 * Not PartialType(CreateBomLineDto): componentVariantId is absent on purpose.
 *
 * Changing which component a line points at is not an edit, it is a different
 * line — and it would have to re-run the cycle guard, re-check the unique
 * constraint, and mean something different in an audit payload. Remove the
 * line and add the right one; both are recorded.
 */
export class UpdateBomLineDto {
  @IsOptional()
  @IsString()
  @IsPositiveDecimal()
  quantity?: string;

  @IsOptional()
  @IsIn(['stocked', 'external'])
  supplyType?: 'stocked' | 'external';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
