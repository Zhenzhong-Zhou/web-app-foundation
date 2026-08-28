import { Transform, Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

import { ALL_AUDIT_ACTIONS, type AuditAction } from '../audit-actions';

export class ListAuditDto {
  /**
   * Keyset cursor: the id of the last row already seen. Rows are returned
   * newest first and ids are UUIDv7, so "older than this id" (ADR-010) is
   * one index scan at any depth.
   *
   * Offset paging would be simpler and wrong here: audit_log is append-only,
   * so new rows arriving mid-scroll shift every page down, and the reader
   * silently misses rows.
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

  @IsOptional()
  @IsUUID()
  actorId?: string;

  @IsOptional()
  @IsIn(ALL_AUDIT_ACTIONS)
  action?: AuditAction;

  @IsOptional()
  @IsUUID()
  resourceId?: string;

  // ISO 8601, and converted here rather than in the service: a controller
  // hands services values, not strings to parse.
  @IsOptional()
  @IsISO8601()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  from?: Date;

  @IsOptional()
  @IsISO8601()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  to?: Date;
}
