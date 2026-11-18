import { IsIn, IsOptional } from 'class-validator';

import { SearchableKeysetQueryDto } from '../../../common/dto/searchable-keyset-query.dto';
import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';

/**
 * The reorder points list's filter, search, sort and page (ADR-085): every
 * item with a point unless asked for the low, the out among them, or the
 * out alone.
 */
export class ListReorderPointsDto extends SearchableKeysetQueryDto {
  @IsOptional()
  @IsIn(['low', 'out'])
  status?: 'low' | 'out';

  /**
   * By the suggested order (ADR-093; #473's 16), then in the list's own
   * order; with none, the list's own: the low first (ADR-085).
   */
  @IsOptional()
  @IsIn(['suggested'])
  sort?: 'suggested';

  /** Most first unless asked. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
