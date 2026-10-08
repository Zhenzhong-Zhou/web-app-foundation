import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { CalendarRangeQueryDto } from '../../../common/dto/range-query.dto';
import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';

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

  /** Sorted by credit date or total (ADR-057). */
  @IsOptional()
  @IsIn(['creditDate', 'total'])
  sort?: 'creditDate' | 'total';

  /** Ascending unless asked; with no sort, the list is newest first. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
