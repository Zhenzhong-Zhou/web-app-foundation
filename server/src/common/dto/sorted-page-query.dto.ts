import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

/**
 * The paging half of a list sorted by more than its id (sorted-page.ts),
 * as KeysetQueryDto is of one by its id: Items' list and Stock value's
 * pools (review 64), each joined to its own filters.
 */
export class SortedPageQueryDto {
  /**
   * The answer's `nextCursor`, for the page after it: the last row's
   * place by the sort's key and its id, never read by the client.
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
}
