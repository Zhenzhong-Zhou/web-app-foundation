import {
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

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
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
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
