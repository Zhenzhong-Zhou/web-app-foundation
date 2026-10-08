import { IsISO8601, IsOptional } from 'class-validator';

import { IsCalendarDay } from './calendar-day';
import { SearchableKeysetQueryDto } from './searchable-keyset-query.dto';

/**
 * A list filtered by a calendar day column (ADR-057): `from` and `to`, both
 * included, either open. `from=2026-09-01&to=2026-09-30` is September.
 */
export class CalendarRangeQueryDto extends SearchableKeysetQueryDto {
  @IsOptional()
  @IsCalendarDay()
  from?: string;

  @IsOptional()
  @IsCalendarDay()
  to?: string;
}

/**
 * A list filtered by an instant (ADR-057): `from` included, `until`
 * excluded, either open, as ISO instants the client computes from the
 * reader's days in the reader's time zone. Not `before`: that is the keyset
 * cursor every list already takes.
 */
export class InstantRangeQueryDto extends SearchableKeysetQueryDto {
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  until?: string;
}
