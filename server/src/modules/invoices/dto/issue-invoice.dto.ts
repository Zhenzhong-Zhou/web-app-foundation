import { IsCalendarDay } from '../../../common/dto/calendar-day';

/**
 * The invoice date, sent by whoever issues it.
 *
 * Required rather than defaulted to "today" on the server: it is a day the
 * person chooses, which the dialog starts at the organization's today
 * (ADR-072) and they may change. The date column stores it as it arrives.
 */
export class IssueInvoiceDto {
  @IsCalendarDay()
  invoiceDate!: string;
}
