import { Transform } from 'class-transformer';
import { IsDate, IsIn, IsOptional, IsUUID } from 'class-validator';

import { KeysetQueryDto } from '../../../common/dto/keyset-query.dto';
import { ALL_AUDIT_ACTIONS, type AuditAction } from '../audit-actions';

export class ListAuditDto extends KeysetQueryDto {
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
