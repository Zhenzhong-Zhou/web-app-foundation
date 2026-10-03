import { IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';

/**
 * The two fields a duplicate does not inherit from its source (ADR-031),
 * given for the copy instead: a reference and an expected date are the
 * replacement's own, and raising one is usually when its PO number is known.
 *
 * Both optional, with the rules CreateOrderDto applies to the same fields,
 * because a duplicate made before either is settled is a real case and the
 * edit form takes them later.
 */
export class DuplicateOrderDto {
  /** Their number for the new order, not the source's. Not unique. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reference?: string;

  /** A calendar day, YYYY-MM-DD (ADR-052). */
  @IsOptional()
  @IsCalendarDay()
  expectedAt?: string;
}
