import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class LoginDto {
  // Same normalisation as register.dto.ts. The unique index is on
  // lower(email), so the lookup must match it.
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  email!: string;

  // No MinLength, deliberately — unlike register. A 400 for "too short"
  // answers a question about the stored password before anything is verified,
  // and raising the minimum later would lock out existing accounts at the DTO
  // layer instead of at password change. MaxLength stays: it caps argon2's
  // input, so nobody can post a 10 MB string and buy 30s of CPU.
  @IsString()
  @MaxLength(128)
  password!: string;
}
