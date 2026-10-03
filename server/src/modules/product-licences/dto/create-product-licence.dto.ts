import { IsOptional, IsString, MaxLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';

export class CreateProductLicenceDto {
  /**
   * As issued, never parsed or generated. "80012345", "NPN 80012345" and a
   * DIN are all valid here, because the formats differ per authority and a
   * pattern would reject the next market before anyone reached it.
   */
  @trim()
  @IsString()
  @MaxLength(100)
  number!: string;

  @trim()
  @IsString()
  @MaxLength(100)
  authority!: string;

  /**
   * When it took effect, YYYY-MM-DD (ADR-052). Blank when nobody looked it
   * up.
   */
  @IsOptional()
  @IsCalendarDay()
  issuedAt?: string | null;

  /**
   * The last day it is valid, for schemes that expire. Blank for an NPN,
   * which does not.
   */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string | null;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
