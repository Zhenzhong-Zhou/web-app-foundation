import { IsBooleanString, IsIn, IsOptional, IsUUID } from 'class-validator';

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

  /**
   * Confirmed, with something still to ship (a sale) or still to come (a
   * purchase): Home's To ship and To receive (ADR-058, #163). A sale
   * shipped in full stays confirmed until it is closed (#24), and is left
   * out.
   */
  @IsOptional()
  @IsBooleanString()
  outstanding?: string;

  /**
   * Late (ADR-091): outstanding, and expected before the organization's
   * today, the orders Home counts late on To ship and To receive. Brings
   * `outstanding` with it.
   */
  @IsOptional()
  @IsBooleanString()
  late?: string;

  /** Sorted by expected date (ADR-057), orders without one last. */
  @IsOptional()
  @IsIn(['expectedAt'])
  sort?: 'expectedAt';

  /**
   * With a sort, ascending unless asked. With none, the list is newest
   * first, or oldest first with `asc`: by id, which is when each order was
   * made (ADR-010, ADR-057's amendment), for Home's drafts tile.
   */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
