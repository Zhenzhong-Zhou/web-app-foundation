import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * The search of a list that loads whole (ADR-056): Products, Partners and
 * the item pickers. With `search`, only what it finds, matched as every
 * search in the app matches (common/search.ts) and the closest first; without
 * it, everything, in the list's own order.
 */
export class SearchQueryDto {
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}
