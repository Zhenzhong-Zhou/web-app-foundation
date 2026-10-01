import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
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
import {
  RETURN_RESOLUTIONS,
  type ReturnResolution,
} from '../../../database/schema';

/** One item the customer may send back, how many, and what happens to it. */
export class ReturnAuthorizationLineDto {
  @IsUUID()
  lineId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  /** credit, replace or none — per line, since one box often holds both. */
  @IsIn(RETURN_RESOLUTIONS)
  resolution!: ReturnResolution;
}

/**
 * An RMA, raised authorized (ADR-047). There is no request step: the person
 * entering what the customer asked for is the person deciding.
 */
export class CreateReturnAuthorizationDto {
  @IsUUID()
  orderId!: string;

  /** Why it is coming back. Required: the first thing anyone asks. */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /**
   * False when the customer was told to keep or destroy the goods, so
   * credit need not wait for a box that will never come. Defaults to true.
   */
  @IsOptional()
  @IsBoolean()
  expectsGoods?: boolean;

  /** The invoice the customer quoted, if they quoted one. */
  @IsOptional()
  @IsUUID()
  invoiceId?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique((line?: ReturnAuthorizationLineDto) => line?.lineId, {
    message: 'A line appears twice on one RMA — send its total once',
  })
  @ValidateNested({ each: true })
  @Type(() => ReturnAuthorizationLineDto)
  lines!: ReturnAuthorizationLineDto[];
}
