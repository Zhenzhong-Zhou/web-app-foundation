import { IsString, IsUUID, Matches } from 'class-validator';

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
}

/**
 * Quantity only.
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
}
