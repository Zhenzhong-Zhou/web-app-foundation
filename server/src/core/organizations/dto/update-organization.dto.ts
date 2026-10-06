import {
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateIf,
} from 'class-validator';

import { IsCurrencyCode } from '../../../common/dto/currency';
import { IsLocale } from '../../../common/dto/locale';
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';
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
}
