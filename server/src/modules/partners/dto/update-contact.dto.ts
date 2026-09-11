import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/** Written out rather than PartialType — see UpdateAddressDto. */
export class UpdateContactDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  role?: string;

  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(50)
  phone?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
