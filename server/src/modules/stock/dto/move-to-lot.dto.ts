import { ApiProperty } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { IsPositiveDecimal } from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';
import { LOT_EXPIRIES, type LotExpiry } from '../../../database/schema';

/**
 * The new lot a move makes (ADR-094, R20): a code typed as printed, or one
 * the lot series makes for us when the write is saved. Always new: a code
 * the item has is refused, since one of its lots is chosen by its id.
 * What is left out starts as the first lot has it, its expiry, and for a
 * code made for us its supplier's lot (E7), to be changed where the stock
 * moved is really another run.
 *
 * Written out rather than taken from MovementLotDto, as every DTO here
 * is: this one has no `mustBeNew`, being new always.
 */
export class MoveToNewLotDto {
  /**
   * What the box prints, typed as printed; absent with `makeCode`.
   * Uppercased, as a receipt's is (MovementLotDto).
   */
  @IsOptional()
  @trim()
  @upper()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /** True where the lot series makes the code, stored as made here (R3). */
  @IsOptional()
  @IsBoolean()
  makeCode?: boolean;

  /**
   * The supplier's own lot, for a code made for us alone (R5). Absent, the
   * first lot's; empty, to add later in Edit lot details.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  supplierLot?: string;

  /**
   * Which expiry the new lot has (R8): `date`, the day in `expiresAt`;
   * `unknown`; or `none`. With neither this nor `expiresAt`, the first
   * lot's expiry.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, required: false })
  @IsOptional()
  @IsIn([...LOT_EXPIRIES])
  expiry?: LotExpiry;

  /** The day it expires, exactly for `date`: YYYY-MM-DD (ADR-052). */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string;
}

/**
 * Move to another lot (ADR-094, R20): part of a lot at one place into
 * another lot of the same item, one it has or a new one, the stock staying
 * where it is. A correction, so it takes a note, as every correction does
 * (5a).
 */
export class MoveToLotDto {
  /** The place the lot's stock is at, which it stays at. */
  @IsUUID()
  locationId!: string;

  @IsString()
  @IsPositiveDecimal()
  quantity!: string;

  /** Another of the item's lots, by its id; or `lot`, a new one. */
  @IsOptional()
  @IsUUID()
  toLotId?: string;

  @IsOptional()
  @ValidateNested()
  @Type(() => MoveToNewLotDto)
  lot?: MoveToNewLotDto;

  /**
   * Why, required: a person saying the record is wrong, as an
   * adjustment's note is (ADR-023). A blank one is refused by the service,
   * in words.
   */
  @trim()
  @IsString()
  @MaxLength(500)
  note!: string;
}
