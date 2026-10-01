import { IsCalendarDay } from '../../../common/dto/calendar-day';

/**
 * The invoice date, sent by whoever issues it.
 *
 * Required rather than defaulted to "today" on the server: the organization
 * has no timezone, and a server in UTC would date a Vancouver invoice
 * issued at 5pm as tomorrow. The client knows the person's calendar day and
 * sends it; the date column stores it as it arrives.
 */
export class IssueInvoiceDto {
  @IsCalendarDay()
  invoiceDate!: string;
}
