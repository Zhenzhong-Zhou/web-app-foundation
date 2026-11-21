import type { ReleaseLicenceStatus } from '../../../database/schema';

/**
 * A lot's trace as the API returns it (ADR-068, ADR-039, ADR-044): where
 * it came from, what it went into, and who received it. Described for the
 * OpenAPI document by the CLI plugin.
 */

/** The lot itself, named from the catalogue beside its snapshot SKU. */
export class TracedLot {
  id!: string;
  code!: string;
  expiresAt!: string | null;
  /** Its item, for All movements of this lot's stock card (95a). */
  variantId!: string;
  /** Its item's product, the page its name links to. */
  productId!: string;
  sku!: string;
  unitOfMeasure!: string;
  description!: string;
}

/**
 * Where it is now, including bins marked unavailable (ADR-042). A place's
 * name, code and path go only to a reader with `locations.view`, as on
 * Stock (ADR-093, 96a); its id stays.
 */
export class LotBalance {
  locationId!: string;
  /** Null for a reader without `locations.view`. */
  locationName!: string | null;
  /** Null for a reader without `locations.view`. */
  locationCode!: string | null;
  /**
   * The places above it, its warehouse or site first, by name, as Stock
   * sends them (57a; #639). Empty for a place at the top, and for a
   * reader without `locations.view`.
   */
  locationPath!: string[];
  isAvailable!: boolean;
  quantity!: string;
}

/**
 * How it came to exist: received against an order, or made by a run, with
 * the licence the run was released under (ADR-050).
 */
export class LotSource {
  kind!: 'receipt' | 'production';
  at!: Date;
  quantity!: string;
  orderId!: string | null;
  /** The order's own number (ADR-071); null with no order. */
  orderNumber!: string | null;
  orderReference!: string | null;
  supplierName!: string | null;
  runId!: string | null;
  runReference!: string | null;
  licenceId!: string | null;
  licenceNumber!: string | null;
  licenceAuthority!: string | null;
  licenceStatusAtRelease!: ReleaseLicenceStatus | null;
  licenceOverrideReason!: string | null;
  licenceOverriddenByName!: string | null;
}

/** A lot one run step away, or more, up or down the chain. */
export class RelatedLot {
  lotId!: string;
  code!: string;
  sku!: string;
  /** Steps away: 1 is a direct ingredient or batch. */
  depth!: number;
  runId!: string;
  runReference!: string | null;
}

/** Someone who received it, or anything made from it. */
export class LotRecipient {
  /** Null when it left with no recipient on record. */
  partnerId!: string | null;
  partnerName!: string | null;
  orderId!: string | null;
  /** The order's own number (ADR-071); null with no order. */
  orderNumber!: string | null;
  orderReference!: string | null;
  isSampleOrder!: boolean;
  lotId!: string;
  lotCode!: string;
  sku!: string;
  shipped!: string;
  sampled!: string;
  returned!: string;
  /**
   * The day it first left for them, shipped or sampled, in the
   * organization's days (ADR-052); null when only a return is recorded.
   */
  leftOn!: string | null;
}

/** GET /stock/lots/:id/trace. */
export class LotTrace {
  lot!: TracedLot;
  balances!: LotBalance[];
  /**
   * On hand where it can be used: at places marked available, the lot not
   * expired by the organization's today (ADR-093, 10a). With `notUsable`,
   * what a reader without `locations.view` reads in place of its places
   * (96a).
   */
  usable!: string;
  /** On hand at a place not available, or all of it once the lot expired. */
  notUsable!: string;
  sources!: LotSource[];
  madeFrom!: RelatedLot[];
  wentInto!: RelatedLot[];
  recipients!: LotRecipient[];
}
