import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/dto/account-rules';

export class ResetPasswordDto {
  @IsString()
  @MinLength(20)
  @MaxLength(200)
  token!: string;

  // The same rule as every new password (account-rules.ts). A password set
  // by recovery is not a lesser password.
  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
