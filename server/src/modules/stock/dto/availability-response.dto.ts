/**
 * Stock availability as the API returns it (ADR-068, ADR-045), described
 * for the OpenAPI document by the CLI plugin.
 */

/** One item's stock, as promising it needs. */
export class Availability {
  variantId!: string;
  sku!: string;
  unitOfMeasure!: string;
  /** Stock at locations marked available: what could be promised. */
  onHand!: string;
  /** Held for confirmed sales, earliest confirmed first. */
  held!: string;
  /** Neither held nor unavailable: free to promise, sample or use. */
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
