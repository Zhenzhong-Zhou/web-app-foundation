import { ApiProperty } from '@nestjs/swagger';
import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';
import { LOT_EXPIRIES, type LotExpiry } from '../../../database/schema';

/**
 * A new lot, made with the movement rather than beforehand (ADR-094): a
 * code typed as printed, or one the organization's lot series makes for
 * it when the write is saved. An existing lot is named by its id beside
 * this, never here.
 *
 * A typed code is resolved inside the same transaction: a second delivery
 * of lot L2024-A finds the existing row rather than colliding on the
 * unique index, which is what "more units of the same run arrived" should
 * mean, unless the write says the lot must be new.
 */
export class MovementLotDto {
  /**
   * What the supplier printed, typed as printed; absent with `makeCode`.
   *
   * Uppercased, because the unique index on (organization_id, variant_id,
   * code) is case-sensitive: without this, "l2024-a" and "L2024-A" are two
   * lots for one physical run, and a recall for one returns half the units.
   * Rows written before this stay as they were — the normalization applies to
   * what arrives, not to what is stored.
   */
  @IsOptional()
  @trim()
  @upper()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /**
   * True where the delivery shows no code: the lot series makes one when
   * the write is saved, inside its transaction, so two writes at once never
   * share it and a write refused uses none (ADR-094, R3). The lot is stored
   * as made here; a typed code is stored as printed (R4).
   */
  @IsOptional()
  @IsBoolean()
  makeCode?: boolean;

  /**
   * True where the write makes a lot and may not add to one: Count it in's
   * new lot (ADR-093, 84a), where one of the item's lots is chosen by its
   * id instead. A typed code the item has is then refused, never reused.
   * Said by the write, never read from the movement's reason (#649's 46).
   */
  @IsOptional()
  @IsBoolean()
  mustBeNew?: boolean;

  /**
   * The supplier's own lot, as printed, its case kept (ADR-094, R5): only
   * for a code made for us, since a typed code is the supplier's already.
   * Empty reads as not known yet, to add later in Edit lot details.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  supplierLot?: string;

  /**
   * Which expiry the new lot has (ADR-094, R8): `date`, the day in
   * `expiresAt`; `unknown`, not known yet; or `none`. Absent, as a tab
   * opened before sends it, it is `date` with a day and `none` without.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, required: false })
  @IsOptional()
  @IsIn([...LOT_EXPIRIES])
  expiry?: LotExpiry;

  /**
   * The day it expires, exactly for an expiry `date`. Ignored when a typed
   * code finds a lot that exists: a second delivery does not get to
   * rewrite the expiry of units already on the shelf, and the expiry is
   * corrected through PATCH /stock/lots/:id instead. A calendar day,
   * YYYY-MM-DD (ADR-052).
   */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string;
}
