import {
  IsBoolean,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';

/**
 * Written out rather than PartialType(CreateAddressDto), matching
 * UpdatePartnerDto: every DTO in this codebase states its own shape, and one
 * file inheriting where the rest do not is a style a reader has to learn twice.
 *
 * Every field is optional here and only here — an address with no line1 is not
 * creatable, but a PATCH that only moves the default flag should not have to
 * resend the street.
 */
export class UpdateAddressDto {
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  label?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(200)
  line2?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  city?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  @IsOptional()
  @upper()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be a two-letter ISO-3166 code, such as CA or US',
  })
  country?: string;

  @IsOptional()
  @IsBoolean()
  isBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  isShipping?: boolean;

  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
