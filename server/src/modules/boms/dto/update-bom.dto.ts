import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

/**
 * Header fields only, and drafts only — the service enforces the second part.
 *
 * `outputVariantId`, `version`, and `status` are all absent. The first would
 * turn one recipe into another under the same id; the second is assigned at
 * creation; the third moves through promote and archive, which are transitions
 * with rules rather than a field anyone may set.
 */
export class UpdateBomDto {
  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'outputQuantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  outputQuantity?: string;

  @IsOptional()
  @IsUUID()
  licenceId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
