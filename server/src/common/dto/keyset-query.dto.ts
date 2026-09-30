import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

/**
 * The paging half of every keyset list (ADR-018), which each list DTO
 * extends with its own filters. Eight lists wrote these two fields out
 * identically; a change to the cap now reaches all of them.
 *
 * Offset paging would be simpler and wrong: these tables are appended to
 * while somebody scrolls, so every page would shift down and they would
 * silently miss rows.
 */
export class KeysetQueryDto {
  /**
   * The id of the last row already seen. Rows come newest first and ids are
   * UUIDv7 (ADR-010), so "older than this id" is one index scan at any depth.
   */
  @IsOptional()
  @IsUUID()
  before?: string;

  /** How many to return. Capped, or ?limit=999999 pulls the table at once. */
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
