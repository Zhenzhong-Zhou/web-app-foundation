import { IsString, MaxLength, MinLength } from 'class-validator';

import {
  PASSWORD_MAX_LENGTH,
  PASSWORD_MIN_LENGTH,
} from '../../../common/dto/account-rules';

export class ChangePasswordDto {
  // No MinLength, for the same reason login.dto.ts has none: a 400 for "too
  // short" answers a question about the stored password before anything is
  // verified.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  currentPassword!: string;

  @IsString()
  @MinLength(PASSWORD_MIN_LENGTH)
  @MaxLength(PASSWORD_MAX_LENGTH)
  newPassword!: string;
}
