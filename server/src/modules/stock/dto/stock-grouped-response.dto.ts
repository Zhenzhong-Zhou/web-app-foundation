import { ApiProperty } from '@nestjs/swagger';

import {
  LOT_EXPIRIES,
  type LotExpiry,
  type ProductType,
} from '../../../database/schema';
import type { ReorderStatus } from '../reorder-status';

/**
 * Inventory's grouped read as the API returns it (ADR-068; ADR-093): a
 * row per code, its places and their lots, and the Lot view, each its
 * own shape. Quantities are numeric(18,4) strings, never parsed into a
 * number (ADR-025); days are `YYYY-MM-DD` (ADR-052).
 */

/** A code's figures at the one place chosen (20a). */
export class StockHere {
  onHand!: string;
  /** How many of its lots are here, for "2 lots". */
  lots!: number;
  /** The soonest expiry of the usable stock here, or null. */
  expiresFirst!: string | null;
}

/**
 * One code, a variant (A1), with its figures from the one read
 * (code-figures.ts): On hand and its not-usable parts by why, Free,
 * Held, Short, Coming with its day, Left, what expires first and the
 * status, as Where it stands and Reorder read them.
 */
export class StockCodeRow {
  variantId!: string;
  /** The item, for its page (ADR-092). */
  productId!: string;
  /** The item's type, for its icon and its word (#546). */
  type!: ProductType;
  /** The product's cover (ADR-062), or null. */
  coverFileId!: string | null;
  sku!: string;
  /** In the reader's language (ADR-056). */
  productName!: string;
  variantName!: string | null;
  unitOfMeasure!: string;
  /** How many places hold it, "2 places"; 0 is "None on hand". */
  places!: number;
  /** How many lots it holds, every place's, for a reader without places. */
  lots!: number;
  onHand!: string;
  usable!: string;
  /** Expired, issued and unavailable together. */
  notUsable!: string;
  expired!: string;
  issued!: string;
  unavailable!: string;
  held!: string;
  /** Usable less held, never below 0. */
  free!: string;
  /** What confirmed sales want beyond what they hold, "20 short". */
  short!: string;
  coming!: string;
  /** The soonest day a purchase is expected; a run has none. */
  comingOn!: string | null;
  /** Left: usable, plus coming, less what confirmed sales still want. */
  position!: string;
  /** The soonest expiry of the usable stock, or null. */
  expiresFirst!: string | null;
  /**
   * Whether every unit on hand has expired, wherever it sits, a place
   * not available too: Expires first's "all expired" (#611; review 13).
   */
  allExpired!: boolean;
  reorderPoint!: string | null;
  /** Null without a reorder point (A4). */
  status!: ReorderStatus | null;
  /** Some of it waits for a cost (ADR-048). */
  needsCost!: boolean;
  /**
   * Ever stocked where the row stands, at the place chosen or any: false
   * for an item never received there, with nothing to correct (ADR-093).
   */
  stocked!: boolean;
  /**
   * Whether the code tracks lots now (ADR-094): its own, read live, since
   * a code with nothing on hand holds no lot to tell it by, as Count it
   * in… must.
   */
  tracksLots!: boolean;
  /** Its figures at the place chosen, or null with none chosen. */
  here!: StockHere | null;
}

/** GET /stock/by-code: one page. */
export class StockCodePage {
  entries!: StockCodeRow[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}

/**
 * GET /stock/by-code/counts: the rows each quick filter shows, with the
 * other filters on and its own off.
 */
export class StockCodeCounts {
  low!: number;
  out!: number;
  expiring!: number;
  expired!: number;
  needsCost!: number;
  /**
   * The rows the list shows, every filter asked on: "Showing 50 of 128
   * codes" beside Show 50 more.
   */
  total!: number;
}

/**
 * GET /stock/by-lot/counts: the Lot view's rows each quick filter shows,
 * lots at each place, with the other filters on and its own off (ADR-093,
 * 30a). No Out: a code that is out keeps no lot (31a).
 */
export class StockLotCounts {
  low!: number;
  expiring!: number;
  expired!: number;
  needsCost!: number;
  /**
   * Details to add (ADR-094, R9; E5): a lot whose expiry is not known
   * yet, or made here with no supplier's lot.
   */
  detailsToAdd!: number;
  /** The lots the list shows, every filter asked on: "Showing 50 of 312 lots". */
  total!: number;
}

/** A run still open that a pile was issued to (review 73). */
export class IssuedRun {
  id!: string;
  /** What people call the run; null for one with no reference. */
  reference!: string | null;
  /** Names a run with no reference: "1,000 planned". */
  quantityPlanned!: string;
}

/**
 * One pile: a code at one place, in one lot when it tracks lots, as the
 * row's menu, Move, Edit lot and History read it.
 */
export class StockPile {
  /** The stock row itself. */
  id!: string;
  variantId!: string;
  sku!: string;
  productName!: string;
  variantName!: string | null;
  unitOfMeasure!: string;
  locationId!: string;
  /** Null for a reader without `locations.view` (ADR-093, A6). */
  locationName!: string | null;
  locationCode!: string | null;
  lotId!: string | null;
  lotCode!: string | null;
  lotExpiresAt!: string | null;
  /**
   * Which expiry the lot has (ADR-094, R8): a day, not known yet, which
   * reads "Expiry to add", or none; null with no lot.
   */
  @ApiProperty({ enum: LOT_EXPIRIES, nullable: true })
  lotExpiry!: LotExpiry | null;
  /** Whether the code was made here, not printed (ADR-094). */
  lotIsAssigned!: boolean | null;
  /**
   * The supplier's own lot, as printed, for a code made here; null for a
   * printed code, one whose supplier's lot is still to add, and no lot.
   */
  lotSupplierLot!: string | null;
  /**
   * The code the lot had last before its code today, for "was {code}"
   * under it (ADR-094 amended, R9); null for a lot never corrected, and
   * no lot.
   */
  lotFormerCode!: string | null;
  quantity!: string;
  /**
   * The organization's day it was emptied, its last change leaving none;
   * null while it holds stock (ADR-093: "Emptied 14 Nov").
   */
  emptiedOn!: string | null;
  /**
   * The run still open that its lot was issued to here, whose close takes
   * it: Move to another lot is refused while it is open (review 73). Null
   * otherwise, and with no lot.
   */
  issuedToRun!: IssuedRun | null;
}

/** One place holding a code, and its lots there, soonest first. */
export class StockPlace {
  locationId!: string;
  /** Null for a reader without `locations.view` (ADR-093, A6). */
  locationName!: string | null;
  locationCode!: string | null;
  /**
   * The places above it, its warehouse or site first, by name: Stock and
   * Where it stands write "Main warehouse › Zone A › Shelf A2" (57a).
   * Empty for a place at the top, and for a reader without
   * `locations.view`.
   */
  locationPath!: string[];
  /** False at a place not available, such as quarantine (ADR-042). */
  isAvailable!: boolean;
  onHand!: string;
  /** Its lots here, soonest first, one with no expiry after them. */
  lots!: StockPile[];
}

/** GET /stock/by-code/:variantId/places. */
export class StockCodePlaces {
  places!: StockPlace[];
}

/**
 * One lot at one place (25a), a pile, as Home's Expiring soon counts it,
 * with how many places its lot is in, "1 of 2 places".
 */
export class StockLotRow extends StockPile {
  productId!: string;
  type!: ProductType;
  coverFileId!: string | null;
  /**
   * The places above it, its warehouse or site first, by name: Stock and
   * Where it stands write "Main warehouse › Zone A › Shelf A2" (57a).
   * Empty for a place at the top, and for a reader without
   * `locations.view`.
   */
  locationPath!: string[];
  /** False at a place not available, such as quarantine (ADR-042). */
  isAvailable!: boolean;
  /** How many places hold its lot. */
  places!: number;
}

/** GET /stock/by-lot: one page. */
export class StockLotPage {
  entries!: StockLotRow[];
  /** Pass as `before` for the next page; null when there is no more. */
  nextCursor!: string | null;
}
