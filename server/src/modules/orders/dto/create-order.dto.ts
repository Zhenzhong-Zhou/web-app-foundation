import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import {
  ORDER_DIRECTIONS,
  type OrderDirection,
} from '../../../database/schema';
import { AddOrderLineDto } from './order-line.dto';

/**
 * A line of a new order is exactly a line added to an existing one — same
 * item, same terms, same rules — so it is that class under the name the
 * order's own DTO has always used.
 */
export class CreateOrderLineDto extends AddOrderLineDto {}

export class CreateOrderDto {
  @IsUUID()
  partnerId!: string;

  @IsIn([...ORDER_DIRECTIONS])
  direction!: OrderDirection;

  /** A sample rather than a sale. Sales only; refused on a purchase. */
  @IsOptional()
  @IsBoolean()
  isSample?: boolean;

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
