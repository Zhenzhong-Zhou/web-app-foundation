import type {
  ProductionRun,
  RunLine,
} from './dto/production-order-response.dto';
import type {
  ProductionOrder,
  ProductionOrderLine,
} from './production-orders.service';

/*
 * A run and its lines as the API returns them (ADR-068): their own fields,
 * never the row, which would also send the organization, a line's notes
 * and the timestamps. Shared by the reads and by the writes that return
 * lines, so a line has one shape.
 */

export function runOf(row: ProductionOrder): ProductionRun {
  return {
    id: row.id,
    outputVariantId: row.outputVariantId,
    bomId: row.bomId,
    partnerId: row.partnerId,
    locationId: row.locationId,
    quantityPlanned: row.quantityPlanned,
    quantityProduced: row.quantityProduced,
    status: row.status,
    reference: row.reference,
    licenceId: row.licenceId,
    licenceNumber: row.licenceNumber,
    licenceAuthority: row.licenceAuthority,
    licenceStatusAtRelease: row.licenceStatusAtRelease,
    licenceOverriddenBy: row.licenceOverriddenBy,
    licenceOverrideReason: row.licenceOverrideReason,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export function runLineOf(row: ProductionOrderLine): RunLine {
  return {
    id: row.id,
    componentVariantId: row.componentVariantId,
    sku: row.sku,
    unitOfMeasure: row.unitOfMeasure,
    quantityPlanned: row.quantityPlanned,
    quantityConsumed: row.quantityConsumed,
    supplyType: row.supplyType,
    sourceLocationId: row.sourceLocationId,
    externalLotCode: row.externalLotCode,
  };
}
