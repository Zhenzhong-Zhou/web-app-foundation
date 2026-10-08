import { IsOptional } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';

/**
 * Home (ADR-058). `today` is the reader's day, so "overdue" and "expired"
 * follow their calendar, not the server's; absent, the server's.
 */
export class HomeQueryDto {
  @IsOptional()
  @IsCalendarDay()
  today?: string;
}
