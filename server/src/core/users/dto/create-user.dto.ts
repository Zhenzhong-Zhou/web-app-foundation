import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

import { normalizeEmail } from '../../../common/dto/normalize-email';

export class CreateUserDto {
  @normalizeEmail()
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  // Only the demo seed's colleagues get a password this way, known on
  // purpose so the demo can be signed into; a person who joins by
  // invitation chooses their own (ADR-077). Same minimum as registration —
  // this account is not lesser for having been created by someone else.
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  // The role is chosen, not defaulted. A silent default here is how everyone
  // ends up an Admin.
  @IsUUID()
  roleId!: string;
}
