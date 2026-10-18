import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

import {
  NUMBERING_RESETS,
  type NumberingReset,
} from '../../../database/schema';

/**
 * One series as the screen sends it (ADR-073). Taken exactly as sent: the
 * prefix's form is checked by the service and refused, never tidied, so the
 * audit log's record of what was sent is what was stored (#133).
 */
export class NumberingSeriesDto {
  /** As written, date tokens included: INV-{YYYY}-. Empty for none. */
  @IsString()
  @MaxLength(40)
  prefix!: string;

  @IsInt()
  @Min(1)
  @Max(10)
  digits!: number;

  @IsIn(NUMBERING_RESETS)
  reset!: NumberingReset;

  /**
   * Today's next number, sent only when the person changed it: a form left
   * open while invoices are issued must not drag the counter back.
   */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(9_999_999_999)
  next?: number;
}

/**
 * The whole Numbering section, every series in every save, so two can swap
 * prefixes in one go and the audit entry shows each as it stood.
 */
export class UpdateNumberingDto {
  @ValidateNested()
  @Type(() => NumberingSeriesDto)
  invoice!: NumberingSeriesDto;

  @ValidateNested()
  @Type(() => NumberingSeriesDto)
  creditNote!: NumberingSeriesDto;

  @ValidateNested()
  @Type(() => NumberingSeriesDto)
  returnAuthorization!: NumberingSeriesDto;

  @ValidateNested()
  @Type(() => NumberingSeriesDto)
  saleOrder!: NumberingSeriesDto;

  @ValidateNested()
  @Type(() => NumberingSeriesDto)
  purchaseOrder!: NumberingSeriesDto;

  /** France's rule: no invoice or credit note dated before the latest. */
  @IsBoolean()
  documentsInDateOrder!: boolean;
}
