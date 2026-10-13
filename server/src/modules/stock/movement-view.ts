import type { stockMovements } from '../../database/schema';
import type { RecordedMovement } from './dto/stock-response.dto';

/**
 * A movement just recorded, as the API returns it (ADR-068): the ledger's
 * own fields, without the organization or the actor's id. Shared by every
 * route that records one, so a movement has one shape.
 */
export function movementOf(
  row: typeof stockMovements.$inferSelect,
): RecordedMovement {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    lotId: row.lotId,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    quantity: row.quantity,
    reason: row.reason,
    reasonDetail: row.reasonDetail,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    note: row.note,
    createdAt: row.createdAt,
  };
}
