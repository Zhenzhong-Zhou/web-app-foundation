import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

export class CreatePartnerDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /**
   * The organization's own reference — a supplier number from their accounting
   * package, a customer code. Typed rather than generated for the same reason a
   * SKU is (ADR-023): they already have one, and a second machine-made
   * identifier means every partner has two names.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  code?: string;

  /**
   * VAT, GST, EIN — whatever the jurisdiction calls it. Not validated, because
   * a format check that covers every country is a format check nobody can
   * write, and rejecting a valid number is worse than storing an invalid one.
   */
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
}
