import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class ListAvailabilityDto {
  /** Only products with open demand: what something is promised from. */
  @IsOptional()
  @IsBooleanString()
  promised?: string;

  /**
   * One item's variants alone, as Inventory lists its stock when a row's
   * stock on Items opened it (ADR-092). Another organization's is refused.
   */
  @IsOptional()
  @IsUUID()
  productId?: string;
}
