import { IsString, MaxLength } from 'class-validator';

import { PASSWORD_MAX_LENGTH } from '../../../common/dto/account-rules';

/** Requesting deletion, confirmed with the password (ADR-069). */
export class DeleteAccountDto {
  // No MinLength, as in change-password.dto.ts: a 400 for "too short" would
  // answer a question about the stored password before anything is checked.
  @IsString()
  @MaxLength(PASSWORD_MAX_LENGTH)
  password!: string;
}
