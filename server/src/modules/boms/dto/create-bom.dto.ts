import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { CreateBomLineDto } from './create-bom-line.dto';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;

export class CreateBomDto {
  /**
   * A variant, not a product (ADR-029). Stock, lots, and movements all sit at
   * the variant, so a BOM naming a product could not tell a run which row to
   * increment.
   */
  @IsUUID()
  outputVariantId!: string;

  /**
   * Yield: how much this set of lines produces. "This batch makes 1000
   * capsules and consumes 2.4 kg."
   *
   * Not per single unit. Per-unit forces a division at data entry, someone
   * rounds, and the rounding comes back as stock drift.
   */
  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'outputQuantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  outputQuantity!: string;

  /** The registration this formulation is made under, if any (ADR-029). */
  @IsOptional()
  @IsUUID()
  licenceId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  notes?: string;

  /**
   * Lines may arrive with the header or be added afterwards.
   *
   * Together, because a recipe typed into a form is one act and a two-call
   * flow leaves an empty BOM behind whenever the second call fails. The cap
   * is a guard against a pathological payload, not a real limit — a recipe
   * with two hundred components is a data entry accident.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => CreateBomLineDto)
  lines?: CreateBomLineDto[];
}
