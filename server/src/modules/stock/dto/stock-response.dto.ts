import type { ProductType } from '../../../database/schema';

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

/**
 * The document a movement was for (55a): the order it was received,
 * shipped or returned on, or the run it was issued to or made by.
 */
export class MovementDocument {
  /** Which page opens it: an order's or a run's. */
  kind!: 'order' | 'run';
  /** The order's or the run's id. */
  id!: string;
  /** The order's number; a run's reference, null when it has none. */
  number!: string | null;
}

/**
 * A movement as the ledger lists it, the one row Movements, the item's
 * page and the export read (ADR-093, R9 and R20): the item by today's
 * name and code, the lot, each end, who, when, and the document it was
 * for, each part only for a reader who may see it.
 */
export class Movement {
  id!: string;
  /** The code that moved. */
  variantId!: string;
  /** Its item, whose page the row's name opens. */
  productId!: string;
  /** The code it was recorded under, snapshotted at the time (ADR-023). */
  sku!: string;
  /**
   * The code today, joined from the variant (7a), which the row shows:
   * "was VITC-90" under it when `sku` differs.
   */
  currentSku!: string;
  /** From the catalogue, in the reader's language (ADR-056). */
  productName!: string;
  variantName!: string | null;
  type!: ProductType;
  unitOfMeasure!: string;
  quantity!: string;
  reason!: string;
  reasonDetail!: string | null;
  note!: string | null;
  /**
   * Where it came from; null for stock arriving, from a supplier, a run
   * or a count. The direction is which end is set (ADR-023).
   */
  fromLocationId!: string | null;
  /**
   * Null with no place, and for a reader without `locations.view`, as the
   * code is and the path empty, the id kept (ADR-080; ADR-093, 96a), as
   * Stock's rows send them.
   */
  fromLocationName!: string | null;
  fromLocationCode!: string | null;
  /**
   * The places above it, its warehouse or site first, by name (57a), for
   * the page's rows alone. Empty for a place at the top, for no place,
   * and for a reader without `locations.view`.
   */
  fromLocationPath!: string[];
  /** Where it went; null for stock leaving, to a customer, a run or a count. */
  toLocationId!: string | null;
  /** As `fromLocationName`. */
  toLocationName!: string | null;
  toLocationCode!: string | null;
  /** As `fromLocationPath`. */
  toLocationPath!: string[];
  lotId!: string | null;
  lotCode!: string | null;
  /** The lot's expiry day, `YYYY-MM-DD` (ADR-052); null with none. */
  lotExpiresAt!: string | null;
  /** Who, by name (ADR-063): Deleted User once anonymised (ADR-012). */
  actorName!: string | null;
  /** Null when the actor was anonymised (ADR-012). */
  actorEmail!: string | null;
  createdAt!: Date;
  /**
   * What it was for, from its reference (55a); null with none, and for a
   * reader who may not see orders, or runs, in the list and its export.
   */
  document!: MovementDocument | null;
  /**
   * What came into the stock the list counts, as a stock card's In
   * (ADR-093, 11a): at the place chosen, what came to it; across every
   * place, what arrived, a move between two places neither In nor Out.
   * Null when it went out, or moved within.
   */
  quantityIn!: string | null;
  /** What went out of it, as `quantityIn`: a stock card's Out. */
  quantityOut!: string | null;
  /**
   * The same change signed, a list's Change, which its export writes too,
   * so the two never differ: `quantityIn`, or `quantityOut` negative.
   * Null for a move counted as neither, between two places across every
   * place.
   */
  change!: string | null;
  /**
   * What the list counts after this movement: today's on hand, less what
   * moved after it (41a). Only for one code, its lot or place when chosen
   * too (85a), with every reason and no order (91a); null otherwise.
   */
  balance!: string | null;
}

/**
 * A date range's stock card for one code (ADR-093, R34; 88a): what came
 * in and went out over the range, and the balance at its start and at its
 * end, Closing = Opening + In − Out.
 */
export class MovementPeriod {
  /** The balance before the range's first movement; null where no balance is (91a). */
  opening!: string | null;
  /** Every In over the range, the list's filters on. */
  quantityIn!: string;
  /** Every Out over the range, the list's filters on. */
  quantityOut!: string;
  /** The balance after the range's last movement; null as `opening`. */
  closing!: string | null;
}

/** GET /stock/movements: one page. */
export class MovementPage {
  entries!: Movement[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
  /**
   * The range's stock card, the same on every page: for one code and a
   * date range (88a), never for several items, whose units differ; null
   * otherwise.
   */
  period!: MovementPeriod | null;
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
  /**
   * The movement waits for a cost (ADR-048): found stock in a new lot, or
   * in an item with no cost yet, which its message says (ADR-093, 90a).
   */
  needsCost!: boolean;
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
