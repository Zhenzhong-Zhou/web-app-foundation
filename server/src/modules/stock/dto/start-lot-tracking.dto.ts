import { ApiProperty } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';
import { LOT_EXPIRIES, type LotExpiry } from '../../../database/schema';

/**
 * Start tracking lots (ADR-094, R14): what is known of the stock on hand,
 * for the lot made for us that takes it. Each optional: none known, the
 * lot's supplier's lot is to add, and its expiry is none, as a lot from
 * before reads, unless the question says otherwise.
 */
export class StartLotTrackingDto {
  /**
   * The supplier's own lot, as printed, its case kept (R5), when the stock
   * on hand came from one delivery whose box shows it.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  supplierLot?: string;

  /**
   * Which expiry the lot has (R8): `date`, the day in `expiresAt`;
   * `unknown`, not known yet; or `none`. Absent, `date` with a day and
   * `none` without.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, required: false })
  @IsOptional()
  @IsIn([...LOT_EXPIRIES])
  expiry?: LotExpiry;

  /** The day it expires, exactly for `date`: YYYY-MM-DD (ADR-052). */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string;
}
