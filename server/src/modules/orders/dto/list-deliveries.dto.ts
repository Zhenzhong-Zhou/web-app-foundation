import { IsUUID } from 'class-validator';

/** The item whose deliveries a receipt may be (ADR-093, v3). */
export class ListDeliveriesDto {
  @IsUUID()
  variantId!: string;
}
