import { IsIn, IsOptional, IsUUID } from 'class-validator';

export class ListBomsDto {
  /** Every version of one product's recipe, for the history panel. */
  @IsOptional()
  @IsUUID()
  outputVariantId?: string;

  /**
   * Unfiltered by default, which is the opposite of what a picker wants and
   * the right default for a list screen: a draft that vanished is harder to
   * explain than one shown as a draft. Callers choosing a recipe to run pass
   * `status=active`.
   */
  @IsOptional()
  @IsIn(['draft', 'active', 'archived'])
  status?: 'draft' | 'active' | 'archived';
}
