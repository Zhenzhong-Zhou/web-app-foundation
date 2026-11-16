/**
 * Stock availability as the API returns it (ADR-068, ADR-045), described
 * for the OpenAPI document by the CLI plugin.
 */

/** One item's stock, as promising it needs. */
export class Availability {
  variantId!: string;
  sku!: string;
  /** In the reader's language (ADR-056). */
  productName!: string;
  variantName!: string | null;
  unitOfMeasure!: string;
  /** Every unit at every place, usable or not (ADR-093). */
  onHand!: string;
  /** On hand less usable: the next three added up. */
  notUsable!: string;
  /** In lots past their expiry, at places marked available. */
  expired!: string;
  /** Issued to released runs and not yet consumed, at places marked available. */
  issued!: string;
  /** At places not available, such as quarantine (ADR-042). */
  unavailable!: string;
  /** Held for confirmed sales from usable stock, earliest confirmed first. */
  held!: string;
  /** Usable less held, never below 0: free to promise, sample or use. */
  free!: string;
  /** Wanted by confirmed sales beyond what exists. */
  backordered!: string;
}

/** One confirmed sale line's hold (ADR-045). */
export class LineHold {
  lineId!: string;
  outstanding!: string;
  held!: string;
  short!: string;
}
