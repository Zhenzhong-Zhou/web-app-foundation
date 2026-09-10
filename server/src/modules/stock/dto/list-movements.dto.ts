import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { MOVEMENT_REASONS } from '../../../database/schema';

export class ListMovementsDto {
  /**
   * Keyset cursor: the id of the last row already seen. Rows come back newest
   * first and ids are UUIDv7, so "older than this id" (ADR-010) is one index
   * scan at any depth.
   *
   * Offset paging would be simpler and wrong: the ledger is append-only, so
   * rows arriving mid-scroll shift every page down and the reader silently
   * misses some. Same reasoning as the audit log.
   */
  @IsOptional()
  @IsUUID()
  before?: string;

  // Capped, or ?limit=999999 pulls the ledger in one query.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

  /**
   * The usual question is about one item — "why does this shelf say 47" — so
   * this is the filter the index is built for (ADR-025). Absent, the endpoint
   * answers "what happened lately" across the organisation instead.
   */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn([...MOVEMENT_REASONS])
  reason?: (typeof MOVEMENT_REASONS)[number];
}
