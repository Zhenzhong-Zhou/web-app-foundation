import { IsOptional, IsUUID } from 'class-validator';

/**
 * A draft is created from a shipment and bills exactly what it carried
 * (ADR-046). Everything else — lines, quantities, prices, currency — comes
 * from the shipment and its order, so the body names the shipment and
 * nothing it could get wrong.
 */
export class CreateInvoiceDto {
  @IsUUID()
  shipmentId!: string;

  /** Applied to every line: most invoices carry one tax treatment. */
  @IsOptional()
  @IsUUID()
  taxCodeId?: string;
}
