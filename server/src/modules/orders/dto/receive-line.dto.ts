import { Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { POSITIVE_DECIMAL } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
import { MovementLotDto } from '../../stock/dto/movement-lot.dto';

/**
 * Receiving against one line of a purchase order.
 *
 * No variant: it comes from the line, which is the point — receiving against
 * an order means receiving what the order said, and letting the caller name a
 * different variant would make the fulfilment number meaningless.
 *
 * No reason either. A receipt against a purchase order is a `receipt`, and the
 * reference columns on the movement say which order it belongs to (ADR-023).
 */
export class ReceiveLineDto {
  @IsUUID()
  toLocationId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  /**
   * The same shape the movement endpoint takes. A lot arrives printed on the
   * box, so it is created with the receipt rather than beforehand — a separate
   * call would leave an orphan whenever the receipt then failed.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => MovementLotDto)
  lot?: MovementLotDto;

  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string;
}
