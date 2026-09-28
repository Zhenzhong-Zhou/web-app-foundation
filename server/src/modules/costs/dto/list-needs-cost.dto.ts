import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class ListNeedsCostDto {
  /**
   * Keyset cursor: the id of the last row already seen. Newest first on a
   * UUIDv7 id, as the movement ledger is read (ADR-018).
   */
  @IsOptional()
  @IsUUID()
  before?: string;

  // Capped, or ?limit=999999 pulls the whole list in one query.
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number;
}
