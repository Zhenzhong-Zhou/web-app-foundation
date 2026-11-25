import { IntersectionType } from '@nestjs/swagger';
import { IsIn, IsOptional } from 'class-validator';

import { SearchQueryDto } from '../../../common/dto/search-query.dto';
import { SortedPageQueryDto } from '../../../common/dto/sorted-page-query.dto';

/**
 * What Stock value's pools are sorted by (ADR-094's amendment, R6): the
 * item, as the page opens, or the value, `value` the smallest first and
 * `-value` the largest.
 */
export const VALUATION_SORTS = ['item', 'value', '-value'] as const;
export type ValuationSort = (typeof VALUATION_SORTS)[number];

/**
 * Stock value's find (ADR-094's amendment, R6): what its count counts as
 * matching, and what its pages hold. `search` finds the item, as every
 * search matches it (ADR-056), or a lot's code, its supplier's lot or a
 * former code (lotMatches).
 */
export class ValuationFindDto extends SearchQueryDto {}

/** Stock value's pools, fifty at a time (ADR-094's amendment, R6). */
export class ListValuationDto extends IntersectionType(
  ValuationFindDto,
  SortedPageQueryDto,
) {
  /** By the item unless asked; by the value, either way. */
  @IsOptional()
  @IsIn(VALUATION_SORTS)
  sort?: ValuationSort;
}
