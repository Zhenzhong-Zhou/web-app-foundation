import {
  IsBoolean,
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
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';
import { InvitationTokenDto } from './invitation-token.dto';

/**
 * Accepting an invitation (ADR-077). Signed in as its address, the token
 * alone: the account is the session's. Otherwise a new account's name,
 * password, language and Keep me signed in, as at registration.
 */
export class AcceptInvitationDto extends InvitationTokenDto {
  @IsOptional()
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  name?: string;

  // Length only, as every new password is (account-rules.ts).
  @IsOptional()
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password?: string;

  /** The language the page was in, which the new account takes. */
  @IsOptional()
  @IsLocale()
  locale?: Locale;

  /** Keep me signed in (ADR-065), ticked unless the person says otherwise. */
  @IsOptional()
  @IsBoolean()
  keepSignedIn?: boolean;
}
