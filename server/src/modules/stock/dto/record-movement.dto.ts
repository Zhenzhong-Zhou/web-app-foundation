import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsPositiveDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
import type { MovementReason } from '../../../database/schema';
import { MovementLotDto } from './movement-lot.dto';

/**
 * The reasons this route records, listed rather than read from
 * MOVEMENT_REASONS (#328): a lot change is written only by starting lot
 * tracking and by a move to another lot, each with both its lots (ADR-094).
 */
export const RECORDED_REASONS = [
  'receipt',
  'shipment',
  'transfer',
  'adjustment',
  'production',
  'consumption',
  'sample',
  'return',
] as const satisfies readonly MovementReason[];

export class RecordMovementDto {
  @IsUUID()
  variantId!: string;

  /**
   * Either an existing lot or a new one. A lot arrives printed on the box, so
   * creating it is part of receiving rather than a separate act — and a
   * two-call flow leaves an orphan lot whenever the movement fails.
   */
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MovementLotDto)
  lot?: MovementLotDto;

  /**
   * Which of these is set encodes direction (ADR-023). The service rejects
   * combinations that do not match the reason: a shipment with a destination
   * is a structurally valid row that means the opposite of what was intended,
   * and no check constraint can catch it.
   */
  @IsOptional()
  @IsUUID()
  fromLocationId?: string;

  @IsOptional()
  @IsUUID()
  toLocationId?: string;

  @IsString()
  @IsPositiveDecimal()
  quantity!: string;

  @ApiProperty({ enum: RECORDED_REASONS })
  @IsIn([...RECORDED_REASONS])
  reason!: (typeof RECORDED_REASONS)[number];

  /**
   * "damaged", "expired", "miscount". Free text under a closed reason, because
   * damage and theft are the same operation and only the explanation differs
   * (ADR-023). A receipt's is why it has no order, one of RECEIPT_DETAILS,
   * or none (ADR-094, R11).
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reasonDetail?: string;

  /**
   * Who a sample went to, or who a receipt with no order came from, kept
   * as a sample's recipient is (ADR-094, R11). A sample or a receipt only,
   * and checked against this organization: a recipient is what a recall
   * finds, and a sender what a lot traces to, so neither can be free text
   * or another tenant's partner (ADR-042).
   *
   * Replaces the reference fields this DTO used to accept. References are
   * the server's to set — an order, a run, a shipment — and a client naming
   * one could attach a movement to any document, including another tenant's.
   */
  @IsOptional()
  @IsUUID()
  recipientPartnerId?: string;

  /**
   * Required for an adjustment, checked in the service and backed by a check
   * constraint: a receipt explains itself, but an adjustment is a person
   * asserting the system is wrong, and a blank one is unauditable (ADR-023).
   *
   * The rule is conditional on `reason`, which class-validator cannot express
   * across fields without a custom validator — so the length rule is here and
   * the conditional one is in StockService.record().
   */
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  note?: string;
}
