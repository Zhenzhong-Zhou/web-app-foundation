import { IsOptional, IsString, IsUUID } from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import {
  IsNonNegativeDecimal,
  IsPositiveDecimal,
} from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

/**
 * The terms of an order line: how much, and at what price.
 *
 * Written once and inherited by every line DTO — creating an order, adding a
 * line, amending one — so the three cannot drift into accepting different
 * quantities or prices. class-validator carries decorators through `extends`,
 * and the whitelist sees the inherited properties.
 */
export class OrderLineTermsDto {
  @IsString()
  @IsPositiveDecimal()
  quantityOrdered!: string;

  @IsOptional()
  @IsString()
  @IsNonNegativeDecimal()
  unitPrice?: string;

  /** Required whenever a price is given — the service enforces the pairing. */
  @IsOptional()
  @trim()
  @IsString()
  @IsCurrencyCode()
  currency?: string;
}

/** A new line: which item, and its terms. Also a line of a new order. */
export class AddOrderLineDto extends OrderLineTermsDto {
  @IsUUID()
  variantId!: string;
}

/**
 * Quantity and price.
 *
 * `variantId` is absent for the reason UpdateBomLineDto gives: pointing a line
 * at a different item is not an edit but a different line, and it would have
 * to re-snapshot the SKU and re-check the one unique constraint on the table.
 * Remove and add instead — both are audited (ADR-033).
 */
export class UpdateOrderLineDto extends OrderLineTermsDto {}
