import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';
import { ORDER_STATUSES } from '../../../database/schema';

/**
 * Header fields and status only.
 *
 * `direction` and `partnerId` are absent deliberately: both are settled when
 * the order is created, and changing either after lines exist would
 * reinterpret every line and every movement that referenced it — the same
 * reasoning that keeps `type` out of UpdateProductDto (ADR-023).
 *
 * Lines are edited through their own routes, because amending a quantity that
 * has already been partly received is a different question from renaming a
 * reference.
 */
export class UpdateOrderDto {
  @IsOptional()
  @IsIn([...ORDER_STATUSES])
  status?: (typeof ORDER_STATUSES)[number];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reference?: string;

  /** A calendar day, YYYY-MM-DD (ADR-052). */
  @IsOptional()
  @IsCalendarDay()
  expectedAt?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
