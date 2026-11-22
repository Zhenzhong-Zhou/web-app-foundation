/**
 * Start tracking lots as the API returns it (ADR-068; ADR-094, R13 to
 * R18), described for the OpenAPI document by the CLI plugin.
 */

/** A place holding the code's stock, all of which goes into the lot. */
export class LotTrackingPlace {
  locationId!: string;
  locationName!: string;
  locationCode!: string | null;
  /**
   * The places above it, its warehouse or site first, by name, as Stock
   * writes them (57a); empty for a place at the top.
   */
  locationPath!: string[];
  /** numeric(18,4) as a string, never parsed into a number (ADR-025). */
  quantity!: string;
}

/**
 * A run in progress, released and not yet closed, that uses the code or
 * makes it: it will close against the lot (Q2a).
 */
export class LotTrackingRun {
  id!: string;
  /** What people call it: a batch number, a works order; or null. */
  reference!: string | null;
  /** True where it makes the code, false where it uses it. */
  makes!: boolean;
}

/**
 * GET /products/:id/variants/:variantId/lot-tracking: what the question
 * says before tracking starts (R14), the places and what each holds, and
 * the runs in progress.
 */
export class LotTrackingQuestion {
  variantId!: string;
  sku!: string;
  /** The code's stock on hand at every place: what the lot will hold. */
  onHand!: string;
  /** Each place with stock, by its path. None: no lot is made (R13). */
  places!: LotTrackingPlace[];
  /** How many runs in progress use or make the code, for every reader. */
  runCount!: number;
  /**
   * The runs themselves, for a reader with `production.view`; null for
   * any other, who reads the count alone (ADR-080).
   */
  runs!: LotTrackingRun[] | null;
}

/** The lot made for us that took the stock on hand. */
export class StartedLot {
  id!: string;
  code!: string;
}

/**
 * POST /products/:id/variants/:variantId/lot-tracking: the code tracks
 * lots, and the lot that took its stock on hand, for the message to name
 * and open; null where it had none, and no lot was made (R13, R15).
 */
export class LotTrackingStarted {
  lot!: StartedLot | null;
}
