import {
  IsBoolean,
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * As with addresses, the owner comes from the route rather than the body.
 *
 * A contact is not a user: nothing here signs in, holds a role, or is subject
 * to ADR-012's anonymization. These are names in a supplier's sales office,
 * recorded so an order has someone to chase.
 */
export class CreateContactDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  name!: string;

  /**
   * What they do, in their words — "Accounts payable", "Warehouse manager".
   * Free text rather than an enum: every organization names these differently
   * and a fixed list would be wrong for the second customer.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  role?: string;

  /**
   * Validated for shape but deliberately not unique. The same person appears
   * at two partners when a rep changes employer, and a shared inbox is one
   * address for four people.
   */
  @IsOptional()
  @trim()
  @IsEmail()
  @MaxLength(254)
  email?: string;

  /**
   * No format check. Extensions, country codes, and "ask for Dave" all end up
   * in this field in practice, and a validator that rejects the third is
   * worse than a column that accepts all of them.
   */
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

  /** Who to contact when nothing more specific applies. At most one per owner. */
  @IsOptional()
  @IsBoolean()
  isPrimary?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
