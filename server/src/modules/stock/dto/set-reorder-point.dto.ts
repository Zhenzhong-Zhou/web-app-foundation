import { IsIn, ValidateIf } from 'class-validator';

import { IsPositiveDecimal } from '../../../common/dto/decimal';
import {
  REORDER_RULES,
  REORDER_SOURCES,
  type ReorderRule,
  type ReorderSource,
} from '../../../database/schema';

/**
 * An item's reorder point whole (ADR-085), as the dialog holds it: adding
 * one and changing one send the same. The quantity a rule does not use is
 * not kept, so changing the rule needs no clearing; null says so.
 */
export class SetReorderPointDto {
  @IsIn(REORDER_SOURCES)
  source!: ReorderSource;

  @IsPositiveDecimal()
  reorderPoint!: string;

  @IsIn(REORDER_RULES)
  rule!: ReorderRule;

  /** What a fixed rule orders in whole multiples of. */
  @ValidateIf((dto: SetReorderPointDto) => dto.rule === 'fixed')
  @IsPositiveDecimal()
  fixedQuantity?: string | null;

  /** The level a maximum rule fills to, above the point. */
  @ValidateIf((dto: SetReorderPointDto) => dto.rule === 'maximum')
  @IsPositiveDecimal()
  maximumQuantity?: string | null;
}
