import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { ORDER_DIRECTIONS } from '../../../database/schema';

/**
 * A positive decimal, as a string — the same rule quantities take everywhere
 * (ADR-025). A JSON number has already been through a double before any
 * validator sees it, and ordering 2.75 kg of raw material is ordinary.
 */
const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

export class CreateOrderLineDto {
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

export class CreateOrderDto {
  @IsUUID()
  partnerId!: string;

  @IsIn([...ORDER_DIRECTIONS])
  direction!: (typeof ORDER_DIRECTIONS)[number];

  /**
   * Their number for this order, not ours — a supplier's confirmation code, a
   * customer's PO reference. Not unique, because two suppliers may reuse one.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reference?: string;

  @IsOptional()
  @IsISO8601()
  expectedAt?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  /**
   * At least one, and created in the same transaction as the header
   * (ADR-027). An order with no lines is a document that orders nothing, and
   * a failure after the header insert would leave one behind — the same
   * reasoning as a product and its first variant.
   */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderLineDto)
  lines!: CreateOrderLineDto[];
}
