import {
  IsBoolean,
  IsISO8601,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import { trim } from '../../../common/dto/trim';
import { upper } from '../../../common/dto/upper';

/**
 * A lot supplied with the movement rather than created beforehand.
 *
 * Resolved by code inside the same transaction: a second delivery of lot
 * L2024-A finds the existing row rather than colliding on the unique index,
 * which is what "more units of the same run arrived" should mean.
 */
export class MovementLotDto {
  /**
   * What the supplier printed, or this organization's own run number.
   *
   * Uppercased, because the unique index on (organization_id, variant_id,
   * code) is case-sensitive: without this, "l2024-a" and "L2024-A" are two
   * lots for one physical run, and a recall for one returns half the units.
   * Rows written before this stay as they were — the normalization applies to
   * what arrives, not to what is stored.
   */
  @trim()
  @upper()
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  code!: string;

  /**
   * Absent for lots that do not expire — hardware, packaging, most equipment.
   * Ignored when the lot already exists: a second delivery does not get to
   * rewrite the expiry of units already on the shelf, and the expiry is
   * corrected through PATCH /stock/lots/:id instead.
   */
  @IsOptional()
  @IsISO8601()
  expiresAt?: string;

  /**
   * False when the code is printed on something physical — a supplier's box,
   * or a label already applied to a production run. True when nobody had a
   * code and the receiver invented one, and for a run whose labels have not
   * been applied yet.
   *
   * Two things turn on it. During a recall, a code nobody printed cannot be
   * matched against a supplier's affected-lot list. And it decides whether the
   * code can be corrected later: a printed code is authoritative, so a typo is
   * fixed by moving stock between lots rather than renaming the row, while an
   * invented one has no external truth behind it and a typo is just a typo.
   */
  @IsOptional()
  @IsBoolean()
  isAssigned?: boolean;
}
