import { IsString, MaxLength, MinLength } from 'class-validator';

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // Same rules as registration. A password set by recovery is not a lesser
  // password.
  @IsString()
  @MinLength(12)
  @MaxLength(128)
  password!: string;
}
