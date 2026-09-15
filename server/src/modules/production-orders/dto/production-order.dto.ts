import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

export class CreateProductionOrderDto {
  @IsUUID()
  outputVariantId!: string;

  /**
   * Optional, because a rework, a trial batch, or a sample is a real run with
   * no recipe behind it — and those are the runs that later become a BOM.
   *
   * Release needs one, though: without a recipe there are no lines to copy and
   * nothing to consume. So a run created without a BOM can currently be
   * planned and cancelled but not released, which is recorded as an open
   * decision rather than pretended away.
   */
  @IsOptional()
  @IsUUID()
  bomId?: string;

  /** Where it is made, and where components are issued to. A leaf. */
  @IsUUID()
  locationId!: string;

  /** Set when a contract manufacturer makes it rather than us (ADR-030). */
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityPlanned must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityPlanned!: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

/**
 * Drafts only — the service enforces that.
 *
 * No status field. Release, output, close, and cancel are transitions with
 * rules attached, and a settable status would let a client move a run
 * anywhere, including backwards past movements that have already been written.
 */
export class UpdateProductionOrderDto {
  @IsOptional()
  @IsUUID()
  bomId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantityPlanned must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantityPlanned?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}

export class ListProductionOrdersDto {
  @IsOptional()
  @IsIn(['draft', 'released', 'completed', 'cancelled'])
  status?: 'draft' | 'released' | 'completed' | 'cancelled';

  @IsOptional()
  @IsUUID()
  outputVariantId?: string;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** Keyset cursor, as ADR-018 established for every list. */
  @IsOptional()
  @IsUUID()
  before?: string;
}
