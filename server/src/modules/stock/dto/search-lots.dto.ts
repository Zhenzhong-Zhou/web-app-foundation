import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * A prefix, not a code. A recall usually begins with a partial code read off
 * a label or a complaint, so the search matches the start of it (ADR-044).
 *
 * Required and non-empty: an empty prefix matches every lot in the
 * organization, which is a list endpoint wearing a search's name.
 */
export class SearchLotsDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;
}
