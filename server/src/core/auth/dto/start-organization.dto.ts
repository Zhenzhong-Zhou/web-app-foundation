import { IsString, MaxLength, MinLength } from 'class-validator';

import { ORGANIZATION_NAME_MAX_LENGTH } from '../../../common/dto/account-rules';
import { IsBrowserTimeZone } from '../../../common/dto/time-zone';
import { trim } from '../../../common/dto/trim';

/**
 * Start an organization (ADR-078): an account with no organization names
 * a new one, where registration is open. Its zone is the browser's, as at
 * registration (ADR-072).
 */
export class StartOrganizationDto {
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(ORGANIZATION_NAME_MAX_LENGTH)
  name!: string;

  @IsBrowserTimeZone()
  timeZone?: string;
}
