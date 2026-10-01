import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { IsPositiveDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

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
  @IsPositiveDecimal()
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
