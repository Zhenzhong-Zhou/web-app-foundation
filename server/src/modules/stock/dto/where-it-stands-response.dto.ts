import type { ReorderSource } from '../../../database/schema';
import type { ReorderStatus } from '../reorder-status';
import type { StockPlace } from './stock-grouped-response.dto';
import type { Movement } from './stock-response.dto';

/**
 * Where it stands, the item's page's first section, as the API returns
 * it (ADR-068; ADR-093, R8): each code's figures from the one read
 * (code-figures.ts), and what is behind them, each part only for a
 * reader who may see it, left out of the answer for the rest (ADR-080).
 * Quantities are numeric(18,4) strings (ADR-025); days `YYYY-MM-DD`
 * (ADR-052).
 */

/** A confirmed sale waiting for the code: what it wants and holds. */
export class StockHold {
  orderId!: string;
  number!: string;
  /** The customer. */
  partnerName!: string;
  /** The day it is expected to ship, or null. */
  expectedAt!: string | null;
  /** What it still wants: ordered less shipped. */
  wanted!: string;
  /** What it holds, the earliest confirmed first (ADR-045). */
  held!: string;
  /** What it wants beyond its hold: "20 short". */
  short!: string;
}

/** A confirmed purchase's line still to receive. */
export class ComingPurchase {
  orderId!: string;
  number!: string;
  /** The supplier. */
  partnerName!: string;
  quantity!: string;
  /** The day it is expected, or null. */
  expectedAt!: string | null;
  /** Its day has passed (the organization's today). */
  late!: boolean;
}

/** A released run's output still to come; a run has no day. */
export class ComingRun {
  runId!: string;
  reference!: string | null;
  /** Who makes it, when another does, or null. */
  partnerName!: string | null;
  quantity!: string;
}

/**
 * A lot's usable stock, its places left out (A6): at the places marked
 * available, not expired, less what runs were issued there.
 */
export class UsableLot {
  /** Null for stock with no lot. */
  lotId!: string | null;
  lotCode!: string | null;
  expiresAt!: string | null;
  quantity!: string;
  /** How many places hold it, "in 2 places". */
  places!: number;
}

/**
 * One code of the item, its figures as Inventory's row and Reorder's
 * read them, and what is behind them by permission.
 */
export class CodeStanding {
  variantId!: string;
  sku!: string;
  /** In the reader's language (ADR-056); null for a variant with none. */
  variantName!: string | null;
  unitOfMeasure!: string;
  /** False once it, or its item, is discontinued. */
  isActive!: boolean;
  onHand!: string;
  usable!: string;
  /** Expired, issued and unavailable together. */
  notUsable!: string;
  expired!: string;
  issued!: string;
  unavailable!: string;
  held!: string;
  /** Usable less held, never below 0: what can still be promised. */
  free!: string;
  /** What confirmed sales still want. */
  stillNeeded!: string;
  /** What they want beyond what they hold, "20 short". */
  short!: string;
  coming!: string;
  /** The soonest day a purchase is expected; a run has none. */
  comingOn!: string | null;
  /** Left: usable, plus coming, less what confirmed sales still want. */
  position!: string;
  /** The soonest expiry of the usable stock, or null. */
  expiresFirst!: string | null;
  reorderPoint!: string | null;
  /** Null without a reorder point (A4). */
  status!: ReorderStatus | null;
  /** Bought or made, as its reorder point says; null without one. */
  source!: ReorderSource | null;
  /**
   * Buy 30 or Make 1,000: the suggested order, as Reorder's row has it
   * (reorder-position.ts); 0 when it is not low, or a draft covers it
   * already; null without a reorder point.
   */
  suggestion!: string | null;
  /** How many confirmed sales still want it: "Held 20 · for 2 orders". */
  heldOrders!: number;
  /** Those sales, oldest confirmed first; null without `orders.view`. */
  holds!: StockHold[] | null;
  /** Its purchases coming, soonest first; null without `orders.view`. */
  purchases!: ComingPurchase[] | null;
  /** Its runs coming; null without `production.view`. */
  runs!: ComingRun[] | null;
  /**
   * By place and lot, each place with its lots, soonest first; null
   * without `locations.view`.
   */
  places!: StockPlace[] | null;
  /**
   * Without `locations.view`: its usable lots, soonest first, the not
   * usable one line, `notUsable`; null with it.
   */
  lots!: UsableLot[] | null;
  /**
   * Its five newest movements, newest first, as Movements lists the code
   * (ADR-093, R12): In, Out and the balance after each, each part by the
   * reader's sight as there (96a, 55a).
   */
  latestMovements!: Movement[];
}

/** GET /products/:id/stock: each code, the low first. */
export class ProductStock {
  codes!: CodeStanding[];
}
