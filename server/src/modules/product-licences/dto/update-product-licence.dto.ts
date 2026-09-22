import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

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

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
