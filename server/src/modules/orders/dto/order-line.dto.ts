import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

import {
  NON_NEGATIVE_DECIMAL,
  POSITIVE_DECIMAL,
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
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityOrdered must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityOrdered!: string;

  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, {
    message:
      'unitPrice must be a number with at most 4 decimal places, sent as a string',
  })
  unitPrice?: string;

  /** Required whenever a price is given — the service enforces the pairing. */
  @IsOptional()
  @trim()
  @IsString()
  @Matches(/^[A-Z]{3}$/, { message: 'currency must be a 3-letter ISO code' })
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
