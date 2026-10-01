import { IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';

/** Written out rather than PartialType, as every DTO here is. */
export class UpdateInvoiceDto {
  /**
   * A calendar day, YYYY-MM-DD, stored in a `date` column as it arrives —
   * never through a JS Date, so no timezone can move it. Null clears it.
   */
  @IsOptional()
  @IsCalendarDay()
  dueDate?: string | null;

  /** Printed on the invoice. Null or empty clears it. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string | null;

  /** Sets every line's code at once — the invoice-level default. */
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}
