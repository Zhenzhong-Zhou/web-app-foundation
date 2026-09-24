import { IsString, MaxLength, MinLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * The reason is required. A void undoes stock leaving, and "why is this
 * shipment struck through" is the first question anyone reading the order
 * afterwards will ask (ADR-041).
 */
export class VoidShipmentDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;
}
