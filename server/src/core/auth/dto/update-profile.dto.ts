import {
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

import { IsLocale } from '../../../common/dto/locale';
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';

/**
 * What a person may change about themselves, each field on its own: a
 * language picker sends only the language, the profile form only the name.
 * Nothing at all changes nothing.
 */
export class UpdateProfileDto {
  // No email. Changing an address is a flow, not a field: the new one has to
  // be verified before it takes effect, or a typo locks the account out.

  /**
   * Optional, but never null: everyone has a name. ValidateIf rather than
   * IsOptional, because IsOptional would let a null through to the NOT NULL
   * column as a 500.
   */
  @ValidateIf((_object, value: unknown) => value !== undefined)
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  /**
   * The language the app speaks to this person (ADR-054). Null goes back to
   * following the browser.
   */
  @IsOptional()
  @IsLocale()
  locale?: Locale | null;
}
