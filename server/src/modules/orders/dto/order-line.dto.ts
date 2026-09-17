import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/** Same rule and reasoning as CreateOrderDto's lines (ADR-025). */
const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

export class AddOrderLineDto {
  @IsUUID()
  variantId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityOrdered must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityOrdered!: string;

  /** Zero is allowed: a free replacement line is real (ADR-035). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
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

/**
 * Quantity and price.
 *
 * `variantId` is absent for the reason UpdateBomLineDto gives: pointing a line
 * at a different item is not an edit but a different line, and it would have
 * to re-snapshot the SKU and re-check the one unique constraint on the table.
 * Remove and add instead — both are audited (ADR-033).
 */
export class UpdateOrderLineDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityOrdered must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityOrdered!: string;

  /** Zero is allowed: a free replacement line is real (ADR-035). */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,14}(\.\d{1,4})?$/, {
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
