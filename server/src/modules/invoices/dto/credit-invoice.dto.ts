import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  ArrayUnique,
  IsArray,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  MaxLength,
  MinLength,
  ValidateNested,
} from 'class-validator';

import {
  NON_NEGATIVE_DECIMAL,
  POSITIVE_DECIMAL,
} from '../../../common/dto/decimal';
import { trim } from '../../../common/dto/trim';

/**
 * One invoice line credited (ADR-047): how many, at what unit price, and —
 * for goods coming back — which RMA line it settles.
 */
export class CreditLineDto {
  @IsUUID()
  invoiceLineId!: string;

  @IsString()
  @Matches(POSITIVE_DECIMAL, {
    message:
      'quantity must be a positive number with at most 4 decimal places, sent as a string',
  })
  quantity!: string;

  /**
   * Defaults to the invoice line's price, and may be lowered, never raised:
   * a restocking fee, goodwill, or a price correction at the difference.
   */
  @IsOptional()
  @IsString()
  @Matches(NON_NEGATIVE_DECIMAL, {
    message:
      'unitPrice must be a number with at most 4 decimal places, sent as a string',
  })
  unitPrice?: string;

  /** For returned goods: the RMA line this credit settles. */
  @IsOptional()
  @IsUUID()
  returnAuthorizationLineId?: string;
}

/** What a preview needs: the lines, and nothing it would store. */
export class PreviewCreditDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ArrayUnique((line?: CreditLineDto) => line?.invoiceLineId, {
    message:
      'An invoice line appears twice on one credit — send its total once',
  })
  @ValidateNested({ each: true })
  @Type(() => CreditLineDto)
  lines!: CreditLineDto[];
}

/**
 * A credit note against one invoice (ADR-047). Issued at once — there is no
 * draft; the preview is where the figures are checked.
 */
export class CreditInvoiceDto extends PreviewCreditDto {
  /** Printed on the credit note, so the customer reads it too. */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /** A calendar day, sent by the client, as the invoice date is. */
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'creditDate must be a calendar day, YYYY-MM-DD',
  })
  @IsISO8601({ strict: true })
  creditDate!: string;
}
