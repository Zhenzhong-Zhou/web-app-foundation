import {
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';

/**
 * The organization's registered address, sent whole (ADR-046).
 *
 * Written out rather than borrowed from CreateAddressDto, as every DTO here
 * states its own shape. The flags and the label are absent on purpose: this
 * is the one address every invoice prints, so it is always the billing
 * default and needs no name.
 */
export class OrganizationAddressDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  line1!: string;

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

  @upper()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be a two-letter ISO-3166 code, such as CA or US',
  })
  country!: string;
}
