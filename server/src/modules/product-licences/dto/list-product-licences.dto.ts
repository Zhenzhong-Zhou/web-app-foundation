import { IsBooleanString, IsOptional } from 'class-validator';

/** The licences list's one filter; without it, every licence. */
export class ListProductLicencesDto {
  /**
   * Expiring (ADR-091): active, and expiring within the notice of the
   * organization's today or already expired, soonest first. What Home's
   * Licences tile counts.
   */
  @IsOptional()
  @IsBooleanString()
  expiring?: string;
}
