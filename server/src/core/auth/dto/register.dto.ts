import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  // Normalised here so it matches the lower(email) unique index, and so the
  // address a user typed with capitals still finds their account at login.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254) // RFC 5321 maximum
  email!: string;

  /**
   * Length only, no composition rules.
   *
   * NIST SP 800-63B advises against mandatory symbol/digit/case requirements:
   * they push people toward predictable patterns (Password1!) without adding
   * real entropy. Length is what matters.
   *
   * The maximum is a denial-of-service guard, not a security limit — argon2
   * would happily spend seconds hashing a multi-megabyte string. Unlike
   * bcrypt, it does not silently truncate.
   */
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  organizationName!: string;
}
