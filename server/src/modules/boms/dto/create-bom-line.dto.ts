import {
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
} from 'class-validator';

import { POSITIVE_DECIMAL } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

export class CreateBomLineDto {
  @IsUUID()
  componentVariantId!: string;

  /**
   * How much the whole batch consumes, measured against the BOM's
   * output_quantity rather than one unit of output (ADR-029).
   *
   * In the component variant's own unit_of_measure. There is no unit field
   * here deliberately: a second unit with nothing converting between them
   * invites grams typed against stock kept in kilograms.
   */
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  /**
   * Who provides this component on a run, as a default the production order
   * can override (ADR-030). `external` means whoever manufactures supplies it:
   * it never enters our stock and no movement is written for it.
   */
  @IsOptional()
  @IsIn(['stocked', 'external'])
  supplyType?: 'stocked' | 'external';

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;
}
