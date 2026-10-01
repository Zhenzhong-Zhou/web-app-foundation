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

class ShipLotDto {
  @IsUUID()
  lotId!: string;

  @IsString()
  @IsPositiveDecimal()
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
  @IsPositiveDecimal()
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
  @IsPositiveDecimal()
  quantity!: string;
}

export class ShipOrderDto {
  @IsUUID()
  fromLocationId!: string;

  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((line?: ShipLineDto) => line?.lineId, {
    message: 'A line appears twice in one shipment — send its total once',
  })
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
