import {
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';

export class UpdateLotDto {
  /**
   * Accepted only for a self-invented code — the service refuses it on a lot
   * whose code came off a supplier's box. See the check in updateLot().
   */
  @IsOptional()
  @trim()
  @upper()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /**
   * Always editable, and not only for typos: stability testing extends a
   * shelf life, and suppliers reissue certificates. An immutable expiry would
   * force a reclassification for something that is a correction of fact.
   */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}
