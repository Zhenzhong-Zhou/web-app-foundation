import { IsISO8601, IsOptional, IsString, MaxLength } from 'class-validator';

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
   * When the registration lapses, for schemes that expire. Blank for an NPN,
   * which does not.
   */
  /** When it took effect. Blank when nobody looked it up. */
  @IsOptional()
  @IsISO8601()
  issuedAt?: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
