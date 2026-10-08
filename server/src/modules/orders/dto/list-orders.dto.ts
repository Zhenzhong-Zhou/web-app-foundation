import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { CalendarRangeQueryDto } from '../../../common/dto/range-query.dto';
import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';
import {
  ORDER_DIRECTIONS,
  ORDER_STATUSES,
  type OrderDirection,
  type OrderStatus,
} from '../../../database/schema';

/**
 * Paged like every list, by KeysetQueryDto; these are the order filters.
 *
 * Orders grow without bound where partners and locations do not, so this list
 * is the first in the app that cannot return everything. Offset paging would
 * be simpler and wrong for the same reason it is wrong for the audit log: new
 * rows arriving mid-scroll shift every page down and the reader misses rows.
 */
export class ListOrdersDto extends CalendarRangeQueryDto {
  /**
   * Absent means open orders only — draft and confirmed.
   *
   * The default is the filter, not a convenience on top of one. An order list
   * answers "what is still outstanding", and a year of received and cancelled
   * documents buries that. `all` is there because the archive has to be
   * reachable, and it is a deliberate choice rather than what you get by
   * doing nothing.
   */
  @IsOptional()
  @IsIn([...ORDER_STATUSES, 'open', 'all'])
  status?: OrderStatus | 'open' | 'all';

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** Sales or purchases only (ADR-058: Home's To ship and To receive). */
  @IsOptional()
  @IsIn(ORDER_DIRECTIONS)
  direction?: OrderDirection;

  /** Sorted by expected date (ADR-057), orders without one last. */
  @IsOptional()
  @IsIn(['expectedAt'])
  sort?: 'expectedAt';

  /** Ascending unless asked; with no sort, the list is newest first. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
