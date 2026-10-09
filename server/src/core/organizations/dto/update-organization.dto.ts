import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import { IsLocale } from '../../../common/dto/locale';
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';
import {
  LICENCE_POLICIES,
  type LicencePolicy,
  ORGANIZATION_RAILS,
  type OrganizationRail,
} from '../../../database/schema';

/**
 * What the organization prints and the rules it works under, each changed
 * on its own.
 */
export class UpdateOrganizationDto {
  /**
   * The organization's name (ADR-061), as at registration: 1 to 100
   * characters once trimmed, never null. Invoices and credit notes copy the
   * seller's name when issued (ADR-046), so renaming changes none already
   * issued.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

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

  /**
   * What documents print in for partners with no choice of their own
   * (ADR-054). Never null: every document needs a language.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsLocale()
  documentLanguage?: Locale;

  /**
   * A second language for a bilingual sheet, printed after the first. Null
   * makes documents one language again. Never the same as the first; the
   * service checks that against the stored one when only this is sent.
   */
  @IsOptional()
  @IsLocale()
  documentSecondLanguage?: Locale | null;

  /**
   * The languages every product must also be named in (ADR-054), checked
   * when an invoice in one of them is issued. Empty requires nothing; never
   * null, for the same reason.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsArray()
  @ArrayUnique()
  @IsLocale({ each: true })
  requiredNameLanguages?: Locale[];

  /**
   * Branding (ADR-060). The accent as `#RRGGBB`, null for the default; the
   * service saves the nearest shade that passes the contrast check. The
   * logo is an uploaded logo file (ADR-059), null to remove it.
   */
  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/)
  accentColor?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsIn(ORGANIZATION_RAILS)
  rail?: OrganizationRail;

  @IsOptional()
  @IsUUID()
  logoFileId?: string | null;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsBoolean()
  logoOnDocuments?: boolean;

  /**
   * When a lot counts as expiring (ADR-060), each 1 to 365 days; critical
   * fewer than warning, checked against the stored one when only one is
   * sent.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(365)
  expiryWarningDays?: number;

  @ValidateIf((_object, value: unknown) => value !== undefined)
  @IsInt()
  @Min(1)
  @Max(365)
  expiryCriticalDays?: number;
}
