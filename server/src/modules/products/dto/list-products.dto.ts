import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SearchQueryDto } from '../../../common/dto/search-query.dto';
import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';
import { PRODUCT_TYPES, type ProductType } from '../../../database/schema';

/** What Items' list sorts by (ADR-092): name unless asked. */
export const ITEM_SORTS = [
  'name',
  'category',
  'stock',
  'added',
  'changed',
] as const;

export type ItemSort = (typeof ITEM_SORTS)[number];

/** Discontinued items: hidden unless asked, then alone or beside the rest. */
export const DISCONTINUED_SHOWN = ['only', 'include'] as const;

export type DiscontinuedShown = (typeof DISCONTINUED_SHOWN)[number];

/** The category filter's word for the items in none. */
export const UNCATEGORISED = 'uncategorised';

/**
 * What Items' list shows (ADR-092): narrowed by its type, its category and
 * its search, discontinued items hidden unless asked, and sorted. Its
 * export takes the same (ADR-057).
 */
export class ItemFiltersDto extends SearchQueryDto {
  /** One type, a tab; every type without it, All. */
  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  /**
   * A category's id, which holds every category under it too, or
   * `uncategorised` for the items in none. A pattern rather than a UUID
   * check, which would document the one word as not allowed.
   */
  @IsOptional()
  @Matches(
    /^(uncategorised|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/,
  )
  category?: string;

  /** `only` for the discontinued alone, `include` beside the rest. */
  @IsOptional()
  @IsIn(DISCONTINUED_SHOWN)
  discontinued?: DiscontinuedShown;

  /** Name unless asked; while a search is typed, its rank comes first. */
  @IsOptional()
  @IsIn(ITEM_SORTS)
  sort?: ItemSort;

  /** Ascending unless asked: names A to Z, stock fewest first. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}

/** Items' list a page at a time (ADR-092): fifty, by keyset. */
export class ListProductsDto extends ItemFiltersDto {
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
