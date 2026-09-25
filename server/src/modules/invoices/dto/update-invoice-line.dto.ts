import { IsOptional, IsString, IsUUID, Matches } from 'class-validator';

import { NON_NEGATIVE_DECIMAL } from '../../../common/dto/decimal';

/**
 * What a draft line may change: its price and its tax code. Not the
 * quantity — the invoice bills what left, and a different quantity is a
 * different shipment (ADR-046). Not the currency, which is the invoice's.
 */
export class UpdateInvoiceLineDto {
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, {
    message:
      'unitPrice must be a number with at most 4 decimal places, sent as a string',
  })
  unitPrice?: string;

  /** A line can differ from the rest: an exempt item on a taxed invoice. */
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}
