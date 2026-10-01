import { IsString, MaxLength, MinLength } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';
import { trim } from '../../../common/dto/trim';

/**
 * Voiding an issued invoice issues a credit note for the whole of it
 * (ADR-046), so the body is what that credit note needs: why, and when.
 */
export class VoidInvoiceDto {
  /**
   * Printed on the credit note, so the customer reads it too. Required:
   * "why was this reversed" is the first question about any credit.
   */
  @trim()
  @IsString()
  @MinLength(1)
  @MaxLength(500)
  reason!: string;

  /**
   * The credit note's date, sent by the client for the reason the invoice
   * date is: the server does not know the person's calendar day.
   */
  @IsCalendarDay()
  creditDate!: string;
}
