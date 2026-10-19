import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

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
  @MaxLength(100)
  name?: string;

  // Registration's rule: length only (register.dto.ts).
  @IsOptional()
  @IsString()
  @MinLength(12)
  @MaxLength(128)
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
