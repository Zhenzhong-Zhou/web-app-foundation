import { IsString, MaxLength, MinLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * The reason is required, and that is the whole point. Deleting a line records
 * nothing; closing one records why the rest never came, which is what somebody
 * asks six months later when the supplier is up for review (ADR-034).
 */
export class CloseLineDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
