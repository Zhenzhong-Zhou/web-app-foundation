import { Transform } from 'class-transformer';
import { IsString, MaxLength, MinLength } from 'class-validator';

import { MIN_SEARCH_LENGTH } from '../../../common/search';

/** What the top bar's lookup sends (ADR-056). */
export class LookupQueryDto {
  /** Trimmed before it is measured: "  a " is one character, refused. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(MIN_SEARCH_LENGTH)
  @MaxLength(100)
  q!: string;
}
