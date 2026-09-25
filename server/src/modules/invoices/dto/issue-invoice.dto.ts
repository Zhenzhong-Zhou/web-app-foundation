import { IsISO8601, IsString, Matches } from 'class-validator';

/**
 * The invoice date, sent by whoever issues it.
 *
 * Required rather than defaulted to "today" on the server: the organization
 * has no timezone, and a server in UTC would date a Vancouver invoice
 * issued at 5pm as tomorrow. The client knows the person's calendar day and
 * sends it; the date column stores it as it arrives.
 */
export class IssueInvoiceDto {
  @IsString()
  @Matches(/^\d{4}-\d{2}-\d{2}$/, {
    message: 'invoiceDate must be a calendar day, YYYY-MM-DD',
  })
  // Strict, so 2026-02-30 is refused here rather than by Postgres as a 500.
  @IsISO8601({ strict: true })
  invoiceDate!: string;
}
