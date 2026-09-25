import { Type } from 'class-transformer';
import { IsIn, IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

import { INVOICE_STATUSES, type InvoiceStatus } from '../../../database/schema';

/** The keyset shape of ListOrdersDto, for the same reasons. */
export class ListInvoicesDto {
  /** The id of the last row already seen; rows come newest first. */
  @IsOptional()
  @IsUUID()
  before?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;

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
}
