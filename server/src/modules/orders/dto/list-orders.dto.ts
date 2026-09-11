import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { ORDER_STATUSES, type OrderStatus } from '../../../database/schema';

/**
 * Same keyset shape as ListAuditDto, deliberately.
 *
 * Orders grow without bound where partners and locations do not, so this list
 * is the first in the app that cannot return everything. Offset paging would
 * be simpler and wrong for the same reason it is wrong for the audit log: new
 * rows arriving mid-scroll shift every page down and the reader misses rows.
 */
export class ListOrdersDto {
  /**
   * The id of the last row already seen. Rows come newest first and ids are
   * UUIDv7 (ADR-010), so "older than this id" is one index scan at any depth
   * rather than a scan that re-reads everything it skips.
   */
  @IsOptional()
  @IsUUID()
  before?: string;

  // Capped, or ?limit=999999 pulls the table in one query.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

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
}
