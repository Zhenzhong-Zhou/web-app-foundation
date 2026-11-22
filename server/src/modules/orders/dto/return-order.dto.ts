import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { IsPositiveDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
import { defineMessage, rule } from '../../../i18n/validation';

class ReturnLotDto {
  @IsUUID()
  lotId!: string;

  @IsString()
  @IsPositiveDecimal()
  quantity!: string;
}

/**
 * One order line coming back. Either a quantity (untracked stock) or lots
 * (tracked stock): for a tracked line the total is the sum of its lots,
 * computed in SQL rather than added up by the client (ADR-025). A tracked
 * line may also take a quantity, beside its lots or alone: what shipped
 * with no lot before the code's lot tracking started (ADR-094, Q3a).
 */
class ReturnLineDto {
  @IsUUID()
  lineId!: string;

  /**
   * An untracked line's; a tracked line's part shipped with no lot before
   * its lot tracking started, as `returnable`'s `fromBefore` offers it.
   */
  @IsOptional()
  @IsString()
  @IsPositiveDecimal()
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

  /**
   * The RMA this return is received against, if any (ADR-047). The return
   * is then held to what it authorized. Optional: goods on the dock are
   * recorded whether or not anyone agreed to them.
   */
  @IsOptional()
  @IsUUID()
  returnAuthorizationId?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((line?: ReturnLineDto) => line?.lineId, {
    message: rule(
      defineMessage({
        id: 'validation.returnLineTwice',
        defaultMessage:
          'A line appears twice in one return — send its total once',
      }),
    ),
  })
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
