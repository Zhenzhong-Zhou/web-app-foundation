import {
  IsEmail,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/dto/account-rules';
import { IsLocale } from '../../../common/dto/locale';
import { normalizeEmail } from '../../../common/dto/normalize-email';
import { IsBrowserTimeZone } from '../../../common/dto/time-zone';
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';

export class RegisterDto {
  // Normalised here so it matches the lower(email) unique index, and so the
  // address a user typed with capitals still finds their account at login.
  @normalizeEmail()
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  // Length only, as every new password is (account-rules.ts).
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  organizationName!: string;

  /**
   * The language the person registered in, if they chose one on the signed
   * out pages (ADR-054). Stored, so the verification email and every screen
   * after it speak it. Absent or null follows the browser.
   */
  @IsOptional()
  @IsLocale()
  locale?: Locale | null;

  /**
   * The new organization's time zone (ADR-072): the registering person's
   * browser zone, which is almost always where the business is. Absent, or
   * one the server does not take, UTC, until an Owner sets it on Profile.
   */
  @IsBrowserTimeZone()
  timeZone?: string;
}
