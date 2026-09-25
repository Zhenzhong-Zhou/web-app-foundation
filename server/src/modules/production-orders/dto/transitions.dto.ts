import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { POSITIVE_DECIMAL } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

class LineSourceDto {
  @IsUUID()
  componentVariantId!: string;

  @IsUUID()
  sourceLocationId!: string;
}

/**
 * One source for the whole run, plus per-line exceptions.
 *
 * A run's components do not come from one place — the blend is in the cold
 * room, the bottles in the packaging aisle (ADR-032) — but most of them do, so
 * the shape that matches the work is a default with overrides rather than a
 * source repeated on every line.
 */
class LotAllocationDto {
  @IsUUID()
  lotId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;
}

/**
 * The lots a person chose for one lot-tracked component, replacing the
 * earliest-expiry-first pick for that line only (ADR-039). They must add up
 * to exactly what the line needs; the server checks, in SQL.
 */
class LineLotsDto {
  @IsUUID()
  componentVariantId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => LotAllocationDto)
  lots!: LotAllocationDto[];
}

export class ReleaseProductionOrderDto {
  @IsUUID()
  sourceLocationId!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineSourceDto)
  overrides?: LineSourceDto[];

  /**
   * Hand-picked lots, per component. Omitted lines are picked earliest
   * expiry first, which is the default and the common case.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => LineLotsDto)
  lots?: LineLotsDto[];
}

/** What release would issue from a source, before anything moves. */
export class IssuePlanQueryDto {
  @IsUUID()
  sourceLocationId!: string;
}

class OutputLotDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  @IsOptional()
  @IsISO8601()
  expiresAt?: string;
}

/**
 * Repeatable: a batch that takes three days reports output three times
 * (ADR-032).
 *
 * `lotId` joins output to a lot this run already produced, which is the
 * default the UI offers. `lot` creates a new one for the case where the batch
 * genuinely divides. Omitting both is only valid for a variant that does not
 * track lots.
 */
export class RecordOutputDto {
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => OutputLotDto)
  lot?: OutputLotDto;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

class ConsumedLineDto {
  @IsUUID()
  lineId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityConsumed must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityConsumed!: string;
}

/**
 * Actual quantities per line. A line left out consumes what was planned.
 *
 * The omission is a convenience, not a backflush: the operator is asserting
 * "this one went as planned" by closing, and typing twelve unchanged numbers
 * to record that is how people start entering the planned figure for the line
 * that did change too.
 */
export class CloseProductionOrderDto {
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ConsumedLineDto)
  lines?: ConsumedLineDto[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class CancelProductionOrderDto {
  /**
   * Required, unlike most notes here. Cancelling a released run leaves issued
   * material sitting at the run's location for someone else to deal with, and
   * "why" is the first thing that person asks.
   */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
