import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { TaxCodeComponentDto } from './tax-code-component.dto';

/** Written out rather than PartialType, as every DTO here is. */
export class UpdateTaxCodeDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /** Retire rather than delete: invoice lines point at the code they used. */
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;

  /**
   * The whole set, replacing what the code had. A rate change by law is a
   * new set of numbers, not an edit to one row, and issued invoices keep
   * their own copy, so nothing already sent changes.
   */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TaxCodeComponentDto)
  components?: TaxCodeComponentDto[];
}
