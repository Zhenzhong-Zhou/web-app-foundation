import { IsBooleanString, IsOptional } from 'class-validator';

/** The licences list's two filters; without either, every licence. */
export class ListProductLicencesDto {
  /**
   * Expiring (ADR-091): active, and expiring within the notice of the
   * organization's today or already expired, soonest first. What Home's
   * Licences tile counts.
   */
  @IsOptional()
  @IsBooleanString()
  expiring?: string;

  /**
   * Expired (ADR-091): active, and past its expiry before the
   * organization's today, soonest first. What Home counts late among
   * Licences, opened by its late button.
   */
  @IsOptional()
  @IsBooleanString()
  expired?: string;
}
