import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Not PartialType(CreatePartnerDto): isActive belongs here and nowhere else. A
 * partner is retired rather than deleted — one referenced by an order cannot be
 * removed without inventing gaps in the history the order exists to record — so
 * the flag only ever changes after creation.
 */
export class UpdatePartnerDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  code?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  taxId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
