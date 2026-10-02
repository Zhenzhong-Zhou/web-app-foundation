import {
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import { trim } from '../../../common/dto/trim';
import { LICENCE_POLICIES, type LicencePolicy } from '../../../database/schema';

/**
 * What the organization prints and the rules it works under, each changed
 * on its own. The name is absent: it is set at registration, and changing it
 * is a question of its own — it is printed on every document the
 * organization has ever issued.
 */
export class UpdateOrganizationDto {
  /**
   * GST/HST, VAT, ABN — as issued, never parsed. The formats differ by
   * country, and a pattern would refuse the next market first. Null or an
   * empty string clears it.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(50)
  taxRegistrationNumber?: string | null;

  /**
   * ISO 4217, what stock is valued in (ADR-048). Cannot be cleared, and
   * cannot change once stock is valued in it — the service refuses that.
   */
  @IsOptional()
  @trim()
  @IsString()
  @IsCurrencyCode()
  baseCurrency?: string;

  /** The sale list for customers with none (ADR-049). Null clears it. */
  @IsOptional()
  @IsUUID()
  defaultSalePriceListId?: string | null;

  /*
   * The licence policy at release (ADR-050). Optional, but never null:
   * every state has to have an answer, so "no policy" is not one. ValidateIf
   * rather than IsOptional, because IsOptional skips validation for null as
   * well, and a null would reach the NOT NULL column as a 500.
   */

  /** A licence whose issue date is still to come. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(LICENCE_POLICIES)
  licenceNotInForcePolicy?: LicencePolicy;

  /** A licence past its expiry date. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(LICENCE_POLICIES)
  licenceExpiredPolicy?: LicencePolicy;

  /** Whether a recipe with no licence is refused at release. */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  licenceRequired?: boolean;
}
