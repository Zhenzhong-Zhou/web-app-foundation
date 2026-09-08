import { IsBooleanString, IsOptional, IsUUID } from 'class-validator';

export class ListStockDto {
  @IsOptional()
  @IsUUID()
  locationId?: string;

  @IsOptional()
  @IsUUID()
  variantId?: string;

  /**
   * Zero rows are kept rather than deleted — a shelf that emptied yesterday is
   * a fact worth having, and LocationsService depends on the row surviving so
   * an emptied leaf can still gain children. But "what is on this shelf" means
   * what is there, so they are hidden unless asked for.
   *
   * A string, not a boolean: query parameters arrive as text and
   * @IsBoolean() would reject "true". The service compares against 'true'.
   */
  @IsOptional()
  @IsBooleanString()
  includeEmpty?: string;
}
