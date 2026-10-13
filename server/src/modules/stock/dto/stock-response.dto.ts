/**
 * Stock as the API returns it (ADR-068): levels, movements, lots and the
 * counts behind the inventory page's filters, described for the OpenAPI
 * document by the CLI plugin.
 */

/** One item's stock at one location, in one lot when it tracks lots. */
export class StockRow {
  /** The stock row itself; also the list's cursor (ADR-051). */
  id!: string;
  variantId!: string;
  sku!: string;
  productName!: string;
  variantName!: string | null;
  /** The product's cover (ADR-062), or null. */
  coverFileId!: string | null;
  unitOfMeasure!: string;
  locationId!: string;
  locationName!: string;
  locationCode!: string | null;
  lotId!: string | null;
  lotCode!: string | null;
  lotExpiresAt!: string | null;
  /** Whether the code was ours to invent (MovementLotDto). */
  lotIsAssigned!: boolean | null;
  /** numeric(18,4) as a string, never parsed into a number (ADR-025). */
  quantity!: string;
}

/** GET /stock: one page. */
export class StockPage {
  entries!: StockRow[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** GET /stock/counts: what the inventory page's two filters would find. */
export class StockCounts {
  expiring!: number;
  needsCost!: number;
}

/** A movement as the ledger lists it. */
export class Movement {
  id!: string;
  /** Snapshotted at the time (ADR-023), not joined from the variant. */
  sku!: string;
  quantity!: string;
  reason!: string;
  reasonDetail!: string | null;
  note!: string | null;
  fromLocationName!: string | null;
  toLocationName!: string | null;
  lotCode!: string | null;
  /** Null when the actor was anonymised (ADR-012). */
  actorEmail!: string | null;
  createdAt!: Date;
}

/** GET /stock/movements: one page. */
export class MovementPage {
  entries!: Movement[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/** A movement just recorded, as the ledger stores it. */
export class RecordedMovement {
  id!: string;
  variantId!: string;
  sku!: string;
  lotId!: string | null;
  fromLocationId!: string | null;
  toLocationId!: string | null;
  quantity!: string;
  reason!: string;
  reasonDetail!: string | null;
  /** What raised it, when something did: an order, a shipment, a run. */
  referenceType!: string | null;
  referenceId!: string | null;
  note!: string | null;
  createdAt!: Date;
}

/** POST /stock/movements. */
export class RecordedMovementEnvelope {
  movement!: RecordedMovement;
}

/** A lot of one item, as the receive dialogs offer it. */
export class Lot {
  id!: string;
  code!: string;
  expiresAt!: string | null;
  /** True when the receiver invented the code (MovementLotDto). */
  isAssigned!: boolean;
}

/** A lot matched by the start of its code (ADR-044). */
export class LotMatch {
  id!: string;
  code!: string;
  expiresAt!: string | null;
  sku!: string;
}
