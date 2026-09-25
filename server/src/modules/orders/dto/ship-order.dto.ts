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

import { POSITIVE_DECIMAL } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

const DECIMAL_MESSAGE =
  'quantity must be a positive number with at most 4 decimal places, sent as a string';

class ShipLotDto {
  @IsUUID()
  lotId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: DECIMAL_MESSAGE })
  quantity!: string;
}

/**
 * One order line in a shipment. A line left out of the list is not shipped
 * this time — partial shipments are the normal case, not an exception.
 */
class ShipLineDto {
  @IsUUID()
  lineId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: DECIMAL_MESSAGE })
  quantity!: string;

  /**
   * Hand-picked lots, replacing earliest-expiry-first for this line only. They
   * must add up to `quantity`; the server checks, in SQL.
   */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => ShipLotDto)
  lots?: ShipLotDto[];
}

/** What would ship, without the lots: the preview computes those. */
class PreviewLineDto {
  @IsUUID()
  lineId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, { message: DECIMAL_MESSAGE })
  quantity!: string;
}

export class ShipOrderDto {
  @IsUUID()
  fromLocationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ShipLineDto)
  lines!: ShipLineDto[];

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  carrier?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(100)
  trackingNumber?: string;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(1000)
  note?: string;
}

export class PreviewShipmentDto {
  @IsUUID()
  fromLocationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PreviewLineDto)
  lines!: PreviewLineDto[];
}
