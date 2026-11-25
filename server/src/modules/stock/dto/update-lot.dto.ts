import { ApiProperty } from '@nestjs/swagger';
import {
  Equals,
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
import { defineMessage, rule } from '../../../i18n/validation';

/**
 * Edit lot details (ADR-094): a field left out stays as it is.
 */
export class UpdateLotDto {
  /**
   * Accepted only for a self-invented code — the service refuses it on a lot
   * whose code came off a supplier's box. See the check in updateLot().
   */
  @IsOptional()
  @trim()
  @upper()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code?: string;

  /**
   * Why the code is changing, as typed (ADR-094 amended, R8, E2a): asked
   * only when `code` differs from the lot's, and then required, kept with
   * the code it leaves on the lot's page. Free text, so never in the
   * Activity log (ADR-018). Ignored when the code stays as it is.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  reason?: string;

  /**
   * The supplier's own lot, as printed, its case kept (ADR-094, R5): for a
   * lot whose code was made here, added once it is known. Empty takes it
   * away, so the lot reads "Supplier's lot to add" again. Refused for a
   * code typed from the box, which is the supplier's own.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(64)
  supplierLot?: string;

  /**
   * Which expiry the lot has (ADR-094, R8): `date`, the day in `expiresAt`;
   * `unknown`, not known yet; or `none`, so a day can be taken away. Absent,
   * as a tab opened before sends it, a day reads `date` and a null day
   * `none`; with neither, the expiry stays as it is.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, required: false })
  @IsOptional()
  @IsIn([...LOT_EXPIRIES])
  expiry?: LotExpiry;

  /**
   * Always editable, and not only for typos: stability testing extends a
   * shelf life, and suppliers reissue certificates. An immutable expiry would
   * force a reclassification for something that is a correction of fact.
   *
   * A calendar day, YYYY-MM-DD (ADR-052), exactly for an expiry `date`.
   */
  @IsOptional()
  @IsCalendarDay()
  expiresAt?: string;

  /**
   * True marks an older lot's code as made here, typed up by the receiver
   * where nothing was printed (ADR-094, R7): its code may then be corrected,
   * and it takes a supplier's lot. Needs stock.lot_made_here. One way, so
   * true alone: a code once marked is never unmarked, since a recall may
   * then no longer match the boxes.
   */
  @ApiProperty({ type: Boolean, enum: [true], required: false })
  @IsOptional()
  @Equals(true, {
    message: rule(
      defineMessage({
        id: 'validation.lotMadeHereOneWay',
        defaultMessage:
          'A lot’s code marked as made up here stays marked. Leave it as it is; the code itself can still be corrected.',
      }),
    ),
  })
  madeHere?: true;
}
