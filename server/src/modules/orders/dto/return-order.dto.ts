import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

const POSITIVE_DECIMAL = /^(?=.*[1-9])\d{1,14}(\.\d{1,4})?$/;
const DECIMAL_MESSAGE =
  'quantity must be a positive number with at most 4 decimal places, sent as a string';

class ReturnLotDto {
  @IsUUID()
  lotId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: DECIMAL_MESSAGE })
  quantity!: string;
}

/**
 * One order line coming back. Either a quantity (untracked stock) or lots
 * (tracked stock), never both: for a tracked line the total is the sum of its
 * lots, computed in SQL rather than added up by the client (ADR-025).
 */
class ReturnLineDto {
  @IsUUID()
  lineId!: string;

  @IsOptional()
  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: DECIMAL_MESSAGE })
  quantity?: string;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ReturnLotDto)
  lots?: ReturnLotDto[];
}

export class ReturnOrderDto {
  /**
   * Where it lands. Usually a location marked unavailable, so returned stock
   * cannot go out again before someone has looked at it.
   */
  @IsUUID()
  toLocationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ReturnLineDto)
  lines!: ReturnLineDto[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  reason?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}
