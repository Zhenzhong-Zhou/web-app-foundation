import { IsOptional } from 'class-validator';

import { IsCalendarDay } from '../../../common/dto/calendar-day';

/**
 * Home (ADR-058). `today` is the day the screen sends, which the app takes
 * from the organization's time zone (ADR-072), so "overdue" and "expired"
 * follow the organization's calendar; absent, the server reads the same
 * day itself.
 */
export class HomeQueryDto {
  @IsOptional()
  @IsCalendarDay()
  today?: string;
}
