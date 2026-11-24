import { IsNotEmpty, IsString, MaxLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Part of a code, not a whole one. A recall usually begins with a partial
 * code read off a label, a complaint or a supplier's letter, so the search
 * matches any part of a lot's code or of its supplier's lot, the start
 * first (ADR-044, amended by ADR-094; #308's 37).
 *
 * Required and non-empty: an empty search matches every lot in the
 * organization, which is a list endpoint wearing a search's name.
 */
export class SearchLotsDto {
  @trim()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  code!: string;
}
