import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsString,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { TaxCodeComponentDto } from './tax-code-component.dto';

export class CreateTaxCodeDto {
  /** What the picker shows and the invoice prints: "GST + PST (BC)". */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  /**
   * Empty is allowed: that is the Exempt code, which charges nothing and
   * says so, rather than a blank that might mean "nobody chose".
   *
   * Capped at five: no real code applies more taxes than that, and a cap
   * keeps a mistaken paste from creating a hundred rows.
   */
  @IsArray()
  @ArrayMaxSize(5)
  @ValidateNested({ each: true })
  @Type(() => TaxCodeComponentDto)
  components!: TaxCodeComponentDto[];
}
