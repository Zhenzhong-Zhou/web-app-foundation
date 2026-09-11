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
 * The owner is not here. It comes from the route — POST to
 * /v1/partners/:partnerId/addresses — so the service never has to work out
 * which foreign key to set and a body cannot claim an owner it was not
 * addressed to (ADR-028).
 */
export class CreateAddressDto {
  /** "Head office", "Dock 3". What someone would call it out loud. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  label?: string;

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

  /** State, province, prefecture, county — whatever the country calls it. */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  region?: string;

  /**
   * Not validated beyond a length. A postal-code pattern that covers every
   * country is a pattern nobody can write, and rejecting a valid address is
   * worse than storing an odd one (ADR-028).
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(32)
  postalCode?: string;

  /**
   * The one field here with a format, and uppercased rather than rejected:
   * "ca" is unambiguous and refusing it would be pedantry, but storing both
   * "ca" and "CA" would make them two countries.
   */
  @upper()
  @IsString()
  @Matches(/^[A-Z]{2}$/, {
    message: 'country must be a two-letter ISO-3166 code, such as CA or US',
  })
  country!: string;

  /** Both, often. One address is frequently used for invoices and deliveries. */
  @IsOptional()
  @IsBoolean()
  isBilling?: boolean;

  @IsOptional()
  @IsBoolean()
  isShipping?: boolean;

  /** Setting this demotes whichever address currently holds it. */
  @IsOptional()
  @IsBoolean()
  isDefault?: boolean;
}
