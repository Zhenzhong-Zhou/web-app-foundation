import { IsOptional, IsUUID } from 'class-validator';

import { CalendarRangeQueryDto } from '../../../common/dto/range-query.dto';

/**
 * The credit notes list (ADR-057): by credit date (from, to), by number or
 * partner (search), by partner or invoice, newest first.
 */
export class ListCreditNotesDto extends CalendarRangeQueryDto {
  @IsOptional()
  @IsUUID()
  partnerId?: string;

  @IsOptional()
  @IsUUID()
  invoiceId?: string;
}
