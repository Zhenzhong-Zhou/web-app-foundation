import { Type } from 'class-transformer';
import {
  IsBooleanString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';
import { PRODUCT_TYPES, type ProductType } from '../../../database/schema';

/**
 * Inventory's filters (ADR-093, R3), the same on a row per code and on
 * the Lot view: the five quick filters, counted beside their buttons,
 * and the item's type, its category, one place and the search.
 */
export class StockFiltersDto {
  /** Low stock, the out among them, as Reorder and Home count it. */
  @IsOptional()
  @IsBooleanString()
  low?: string;

  /** Out: nothing usable and nothing coming. */
  @IsOptional()
  @IsBooleanString()
  out?: string;

  /**
   * Expiring soon: stock in a lot expiring within this many days, the
   * expired among it, counted from the organization's today (ADR-072),
   * the organization's warning days on screen (ADR-060).
   */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(3650)
  expiringWithin?: number;

  /** Expired: stock in a lot past its expiry, part of Expiring soon. */
  @IsOptional()
  @IsBooleanString()
  expired?: string;

  /** Waiting for a cost (ADR-048): what Stock value lists as waiting. */
  @IsOptional()
  @IsBooleanString()
  needsCost?: string;

  @IsOptional()
  @IsIn(PRODUCT_TYPES)
  type?: ProductType;

  /** A category, with every category under it (ADR-092). */
  @IsOptional()
  @IsUUID()
  categoryId?: string;

  /**
   * One place that holds stock (20a): what is there, each row's figures
   * "here" but Free and Held, which stay the whole item's.
   */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** One item's codes: Items' stock number opens Stock for it (ADR-092). */
  @IsOptional()
  @IsUUID()
  productId?: string;

  /**
   * The codes with nothing on hand, held, coming or watched by a point
   * too (A2's Include empty); at one place, its emptied rows.
   */
  @IsOptional()
  @IsBooleanString()
  includeEmpty?: string;

  /** The item, as every search matches it (ADR-056), or a lot's code. */
  @IsOptional()
  @IsString()
  @MaxLength(100)
  search?: string;
}

/**
 * What a row per code is sorted by (ADR-057, amended by ADR-093). Not
 * Free: worked out for every code, it took 335 ms at the large volume,
 * past ADR-051's headroom (35a).
 */
export const STOCK_CODE_SORTS = ['name', 'onHand', 'expires'] as const;
export type StockCodeSort = (typeof STOCK_CODE_SORTS)[number];

/** The page of a list paged by its key's values (sorted-page.ts). */
class ValuesPageDto extends StockFiltersDto {
  /** The answer's `nextCursor`, for the page after it; never read by the client. */
  @IsOptional()
  @IsString()
  @MaxLength(4096)
  before?: string;

  /** Fifty unless asked; capped, as every list's. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}

/** A row per code, fifty at a time (ADR-093, R1 and R16). */
export class ListStockByCodeDto extends ValuesPageDto {
  /** By the item's name unless asked; by On hand or Expires first. */
  @IsOptional()
  @IsIn(STOCK_CODE_SORTS)
  sort?: StockCodeSort;

  /** Ascending unless asked; a code with nothing to expire last either way. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}

/**
 * The Lot view (ADR-093, R4): a row per lot at each place, soonest first,
 * the expired on top, its one order.
 */
export class ListStockByLotDto extends ValuesPageDto {}

/** A code's places and their lots, as its row opens (ADR-093, R2). */
export class StockPlacesDto {
  /** The one place chosen on the list, alone. */
  @IsOptional()
  @IsUUID()
  locationId?: string;

  /** Emptied lots kept, as the list's Include empty asks. */
  @IsOptional()
  @IsBooleanString()
  includeEmpty?: string;
}
