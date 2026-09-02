import { IsString, MaxLength, MinLength } from 'class-validator';

export class ChangePasswordDto {
  // No MinLength, for the same reason login.dto.ts has none: a 400 for "too
  // short" answers a question about the stored password before anything is
  // verified.
  @IsString()
  @MaxLength(128)
  currentPassword!: string;

  @IsString()
  @MinLength(12)
  @MaxLength(128)
  newPassword!: string;
}
