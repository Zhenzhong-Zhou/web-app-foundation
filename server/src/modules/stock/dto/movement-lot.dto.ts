import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * A lot supplied with the movement rather than created beforehand.
 *
 * Resolved by code inside the same transaction: a second delivery of lot
 * L2024-A finds the existing row rather than colliding on the unique index,
 * which is what "more units of the same run arrived" should mean.
 */
export class MovementLotDto {
  /** What the supplier printed, or this organization's own run number. */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  /**
   * Absent for lots that do not expire — hardware, packaging, most equipment.
   * Ignored when the lot already exists: a second delivery does not get to
   * rewrite the expiry of units already on the shelf.
   */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  /**
   * True only when no code existed and the receiver had to invent one. False
   * when the code came from an authoritative source — printed by the supplier,
   * or issued by this organization's numbering scheme for a production run.
   *
   * The distinction matters during a recall: a code nobody printed cannot be
   * matched against a supplier's affected-lot list.
   */
  @IsOptional()
  @IsBoolean()
  isAssigned?: boolean;
}
