import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import {
  NAME_MAX_LENGTH,
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/dto/account-rules';
import { normalizeEmail } from '../../../common/dto/normalize-email';

export class CreateUserDto {
  @normalizeEmail()
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(NAME_MAX_LENGTH)
  name!: string;

  // Only the demo seed's colleagues get a password this way, known on
  // purpose so the demo can be signed into; a person who joins by
  // invitation chooses their own (ADR-077). The same rule as every new
  // password (account-rules.ts): this account is not lesser for having been
  // created by someone else.
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;

  // The role is chosen, not defaulted. A silent default here is how everyone
  // ends up an Admin.
  @IsUUID()
  roleId!: string;
}
