import { IsIn, IsUUID } from 'class-validator';

import { RECENT_KINDS, type RecentKind } from '../../../database/schema';

/** A record page reporting that it opened (ADR-058). */
export class RecordOpenedDto {
  @IsIn(RECENT_KINDS)
  kind!: RecentKind;

  @IsUUID()
  id!: string;
}
