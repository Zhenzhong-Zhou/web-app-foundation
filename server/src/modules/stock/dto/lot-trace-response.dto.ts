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
  sku!: string;
  unitOfMeasure!: string;
  description!: string;
}

/** Where it is now, including bins marked unavailable (ADR-042). */
export class LotBalance {
  locationId!: string;
  locationName!: string;
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
}

/** GET /stock/lots/:id/trace. */
export class LotTrace {
  lot!: TracedLot;
  balances!: LotBalance[];
  sources!: LotSource[];
  madeFrom!: RelatedLot[];
  wentInto!: RelatedLot[];
  recipients!: LotRecipient[];
}
