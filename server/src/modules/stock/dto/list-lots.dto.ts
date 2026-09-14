import { IsUUID } from 'class-validator';

/**
 * Required, unlike ListStockDto's variantId.
 *
 * A lot code is only meaningful against one variant — two suppliers use the
 * same code for different products (lots.ts), so an unfiltered list would
 * offer codes that belong to something else, which is the exact mistake this
 * endpoint exists to prevent.
 */
export class ListLotsDto {
  @IsUUID()
  variantId!: string;
}
