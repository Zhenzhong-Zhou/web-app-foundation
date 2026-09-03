import { IsString, MaxLength, MinLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

export class UpdateProfileDto {
  // Name only. Changing an email is a flow, not a field: the new address has
  // to be verified before it takes effect, or a typo locks the account out.
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}
