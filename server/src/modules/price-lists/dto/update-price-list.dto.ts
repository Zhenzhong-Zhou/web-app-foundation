import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Renaming and retiring only (ADR-049). Direction and currency are not here:
 * a whitelisted DTO refuses them with a 400, which says more than silently
 * ignoring them would.
 */
export class UpdatePriceListDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
