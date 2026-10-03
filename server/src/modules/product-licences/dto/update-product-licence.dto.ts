import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';

export class UpdateProductLicenceDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  number?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  authority?: string;

  /**
   * Withdrawn, expired, or superseded. Recipes made under it keep pointing at
   * it — that is the whole reason it is recorded (ADR-029).
   */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * When it took effect, YYYY-MM-DD (ADR-052). Null clears it; absent leaves
   * it as it is.
   */
  @IsOptional()
  @IsCalendarDay()
  issuedAt?: string | null;

  /** The last day it is valid, YYYY-MM-DD. Null clears it. */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
