import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListNotificationsDto {
  /**
   * Keyset cursor: the id of the last row already seen. Rows come newest
   * first and ids are UUIDv7, so "older than this id" is one index scan at
   * any depth (ADR-010, ADR-018).
   *
   * Offset paging would be wrong for the same reason it is wrong for the
   * audit log: new rows arrive while somebody is scrolling, every page shifts
   * down, and they silently miss one.
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
}
