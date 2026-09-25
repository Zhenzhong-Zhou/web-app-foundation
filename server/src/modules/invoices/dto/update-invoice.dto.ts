import {
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/** Written out rather than PartialType, as every DTO here is. */
export class UpdateInvoiceDto {
  /**
   * A calendar day, YYYY-MM-DD, stored in a `date` column as it arrives —
   * never through a JS Date, so no timezone can move it. Null clears it.
   */
  @IsOptional()
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'dueDate must be a calendar day, YYYY-MM-DD',
  })
  // Strict, so 2026-02-30 is refused here rather than by Postgres as a 500.
  @IsISO8601({ strict: true })
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
