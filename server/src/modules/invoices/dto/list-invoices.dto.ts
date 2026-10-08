import { IsIn, IsOptional, IsUUID } from 'class-validator';

import { CalendarRangeQueryDto } from '../../../common/dto/range-query.dto';
import { SORT_ORDERS, type SortOrder } from '../../../common/sorted-page';
import { INVOICE_STATUSES, type InvoiceStatus } from '../../../database/schema';

/** Paged like every list, by KeysetQueryDto; these are the invoice filters. */
export class ListInvoicesDto extends CalendarRangeQueryDto {
  /**
   * Absent means every status. Unlike orders, there is no "open" default:
   * a voided invoice is still a document someone asks about, and issued
   * ones stay current until payments exist to settle them.
   */
  @IsOptional()
  @IsIn(INVOICE_STATUSES)
  status?: InvoiceStatus;

  @IsOptional()
  @IsUUID()
  partnerId?: string;

  /** An order's invoices, for its page. */
  @IsOptional()
  @IsUUID()
  orderId?: string;

  /** Sorted by invoice date or total (ADR-057), drafts and blanks last. */
  @IsOptional()
  @IsIn(['invoiceDate', 'total'])
  sort?: 'invoiceDate' | 'total';

  /** Ascending unless asked; with no sort, the list is newest first. */
  @IsOptional()
  @IsIn(SORT_ORDERS)
  order?: SortOrder;
}
