import { Transform, Type } from 'class-transformer';
import {
  IsDate,
  IsIn,
  IsInt,
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

  /**
   * Transformed to a Date here so the service is handed values, not strings to
   * parse.
   *
   * @IsDate rather than @IsISO8601: transformation runs before validation, so
   * the validator sees a Date and an ISO check on it always fails. isDate also
   * rejects `new Date('garbage')`, which is a Date with a NaN time, so a
   * malformed string still returns 400.
   */
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  from?: Date;

  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? new Date(value) : value,
  )
  @IsDate()
  to?: Date;
}
