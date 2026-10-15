import { IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

/** Asking for the organization to be deleted (ADR-070). */
export class DeleteOrganizationDto {
  // No MinLength, as in delete-account.dto.ts: a 400 for "too short" would
  // answer a question about the stored password before anything is checked.
  @IsString()
  @MaxLength(128)
  password!: string;

  /**
   * The organization's name, typed to confirm what is being deleted
   * (ADR-070, amended): refused unless it matches.
   */
  @IsString()
  @MaxLength(200)
  organizationName!: string;

  /**
   * True to go ahead without the export. Otherwise one taken by an Owner
   * in the last 24 hours is required.
   */
  @IsOptional()
  @IsBoolean()
  declineExport?: boolean;

  /**
   * True to delete the person's account with it, the same day: only for
   * the organization's only member.
   */
  @IsOptional()
  @IsBoolean()
  deleteAccount?: boolean;
}
