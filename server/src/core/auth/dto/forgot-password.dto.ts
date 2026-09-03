import { IsEmail, MaxLength } from 'class-validator';

import { normalizeEmail } from '../../../common/dto/normalize-email';

export class ForgotPasswordDto {
  @normalizeEmail()
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;
}
