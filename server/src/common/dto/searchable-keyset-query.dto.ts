import { IsOptional, IsString, MaxLength } from 'class-validator';

import { KeysetQueryDto } from './keyset-query.dto';

/**
 * A list's paging with its search (ADR-056): the list narrowed to rows
 * matching `search`, as every search in the app matches (common/search.ts),
 * combined with its other filters and paged as before.
 */
export class SearchableKeysetQueryDto extends KeysetQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
