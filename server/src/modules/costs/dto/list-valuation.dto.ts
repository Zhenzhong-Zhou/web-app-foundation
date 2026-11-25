import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * What Stock value's pools are sorted by (ADR-094's amendment, R6): the
 * item, as the page opens, or the value, `value` the smallest first and
 * `-value` the largest.
 */
export const VALUATION_SORTS = ['item', 'value', '-value'] as const;
export type ValuationSort = (typeof VALUATION_SORTS)[number];

/**
 * Stock value's find (ADR-094's amendment, R6): what its totals count as
 * matching, and what its pages hold.
 */
export class ValuationTotalsDto {
  /**
   * The item, as every search matches it (ADR-056), or a lot's code or
   * its supplier's lot (lotMatches).
   */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/** Stock value's pools, fifty at a time (ADR-094's amendment, R6). */
export class ListValuationDto extends ValuationTotalsDto {
  /**
   * The answer's `nextCursor`, for the page after it: the last pool's
   * place by the sort's key and its id (sorted-page.ts), never read by
   * the client.
   */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  cursor?: string;

  /** How many to return, fifty unless asked; capped, as every list's. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /** By the item unless asked; by the value, either way. */
  @IsOptional()
  @IsIn(VALUATION_SORTS)
  sort?: ValuationSort;
}
