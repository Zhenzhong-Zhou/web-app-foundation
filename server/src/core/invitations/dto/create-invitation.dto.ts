import {
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
} from 'class-validator';

import { IsLocale } from '../../../common/dto/locale';
import { normalizeEmail } from '../../../common/dto/normalize-email';
import { trim } from '../../../common/dto/trim';
import type { Locale } from '../../../common/locales';

export class CreateInvitationDto {
  // Normalised as at registration, so it matches lower(email) on users and
  // on the pending invitations' index.
  @normalizeEmail()
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  // Chosen, never defaulted here: one or more, Owner alone, each one the
  // inviter may give (ADR-080).
  @IsArray()
  @ArrayMinSize(1)
  @ArrayUnique()
  @IsUUID('all', { each: true })
  roleIds!: string[];

  /**
   * The language to write to them in (ADR-077): the email's, and the
   * invitation page's to start with. Absent, the inviter's own.
   */
  @IsOptional()
  @IsLocale()
  locale?: Locale;

  /**
   * A message from the inviter, plain text. Never recorded in the audit
   * log, which keeps free text out (ADR-018).
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(500)
  note?: string | null;

  /**
   * How its link goes (ADR-077): emailed, the default, or handed back for
   * the inviter to pass on themselves, with no email at all.
   */
  @IsOptional()
  @IsIn(['email', 'link'])
  delivery?: 'email' | 'link';
}
