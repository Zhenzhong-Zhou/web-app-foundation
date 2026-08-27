import { Transform } from 'class-transformer';
import {
  IsEmail,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateUserDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  // Admin-created users get a password now; email verification and a
  // set-your-own-password flow land in step 5. Same minimum as registration —
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
