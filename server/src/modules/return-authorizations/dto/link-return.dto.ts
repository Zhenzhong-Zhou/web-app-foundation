import { IsUUID } from 'class-validator';

/**
 * A return received without an RMA, counted against one raised afterwards
 * (ADR-047). The one change a return ever sees: from no RMA to this one,
 * once.
 */
export class LinkReturnDto {
  @IsUUID()
  returnId!: string;
}
