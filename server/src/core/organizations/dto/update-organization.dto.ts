import { IsOptional, IsString, Matches, MaxLength } from 'class-validator';

import { trim } from '../../../common/dto/trim';

/**
 * Only the tax number for now. The name is set at registration, and changing
 * it is a question of its own — it is printed on every document the
 * organization has ever issued.
 */
export class UpdateOrganizationDto {
  /**
   * GST/HST, VAT, ABN — as issued, never parsed. The formats differ by
   * country, and a pattern would refuse the next market first. Null or an
   * empty string clears it.
   */
  @IsOptional()
  @trim()
  @IsString()
  @MaxLength(50)
  taxRegistrationNumber?: string | null;

  /**
   * ISO 4217, what stock is valued in (ADR-048). Cannot be cleared, and
   * cannot change once stock is valued in it — the service refuses that.
   */
  @IsOptional()
  @trim()
  @IsString()
  @Matches(/^[A-Z]{3}$/, {
    message: 'baseCurrency must be a 3-letter ISO code',
  })
  baseCurrency?: string;
}
