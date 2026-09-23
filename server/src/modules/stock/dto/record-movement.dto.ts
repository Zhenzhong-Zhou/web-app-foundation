import { Type } from 'class-transformer';
import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { MOVEMENT_REASONS } from '../../../database/schema';
import { MovementLotDto } from './movement-lot.dto';

/**
 * A positive decimal, as a string.
 *
 * Not `@IsNumber()`. A quantity that arrives as a JSON number has already
 * passed through a double before any validator sees it, which is the precision
 * loss ADR-025 chose `numeric` to avoid — 0.1 + 0.2 does not survive the trip,
 * and the ledger is the last place that should be approximate.
 *
 * The regex does four jobs at once: at most 14 digits before the point and 4
 * after, matching numeric(18, 4); no sign, because direction is the reason's
 * job and a negative here would mean two ways to express one movement; and the
 * lookahead requires a non-zero digit somewhere, so "0" and "0.0000" are
 * rejected. A zero-quantity movement is a row that records nothing happening.
 */
const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

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
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  @IsIn([...MOVEMENT_REASONS])
  reason!: (typeof MOVEMENT_REASONS)[number];

  /**
   * "damaged", "expired", "miscount". Free text under a closed reason, because
   * damage and theft are the same operation and only the explanation differs
   * (ADR-023).
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reasonDetail?: string;

  /**
   * Who a sample went to. Sample only, and checked against this organization:
   * a recipient is what a recall finds, so it cannot be free text or another
   * tenant's partner (ADR-042).
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
