import { IsIn, IsISO8601, IsOptional, IsUUID } from 'class-validator';

import { KeysetQueryDto } from '../../../common/dto/keyset-query.dto';
import { MOVEMENT_REASONS } from '../../../database/schema';

export class ListMovementsDto extends KeysetQueryDto {
  /**
   * The usual question is about one item — "why does this shelf say 47" — so
   * this is the filter the index is built for (ADR-025). Absent, the endpoint
   * answers "what happened lately" across the organisation instead.
   */
  @IsOptional()
  @IsUUID()
  variantId?: string;

  /**
   * Narrows to one lot. The row that opens the history dialog knows which lot
   * it is, and without this the header says "lot L2024-A" over every movement
   * of the variant — the answer to a different question, and the wrong one to
   * act on during a recall.
   */
  @IsOptional()
  @IsUUID()
  lotId?: string;

  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsIn([...MOVEMENT_REASONS])
  reason?: (typeof MOVEMENT_REASONS)[number];

  /**
   * When recorded, from (included) until (excluded), as ISO instants
   * (ADR-057): the client turns the reader's days into them. Not `before`,
   * which is the cursor.
   */
  @IsOptional()
  @IsISO8601({ strict: true })
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  until?: string;
}
