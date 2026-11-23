import { ApiProperty } from '@nestjs/swagger';

import {
  LOT_EXPIRIES,
  type LotExpiry,
  type ReleaseLicenceStatus,
} from '../../../database/schema';

/**
 * A lot's trace as the API returns it (ADR-068, ADR-039, ADR-044): where
 * it came from, what it went into, and who received it. Described for the
 * OpenAPI document by the CLI plugin.
 */

/**
 * How stock came into a lot: received, made in a run, or put into it by
 * a lot change, from another lot, as lot tracking started, or back from
 * before it (ADR-094, R21). Listed, so the document's order is this one
 * (#328).
 */
export const LOT_SOURCE_KINDS = [
  'receipt',
  'production',
  'lot_change',
] as const;

export type LotSourceKind = (typeof LOT_SOURCE_KINDS)[number];

/** The lot itself, named from the catalogue beside its snapshot SKU. */
export class TracedLot {
  id!: string;
  code!: string;
  expiresAt!: string | null;
  /** Which expiry it has: a day, not known yet, or none (ADR-094, R8). */
  @ApiProperty({ enum: LOT_EXPIRIES })
  expiry!: LotExpiry;
  /** True when the code was made here, not printed (ADR-094). */
  isAssigned!: boolean;
  /** The supplier's own lot, as printed, for a code made here; else null. */
  supplierLot!: string | null;
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
 * A lot this one's stock moved on to by moves alone, any number of hops
 * (ADR-094, S9), with all it holds now, as Where it is now reads the
 * traced lot: stock it held before the move too, since a recall reaches
 * more, never fewer. A lot emptied since is listed with nothing.
 */
export class MovedOnLot {
  lotId!: string;
  code!: string;
  /** Each place holding some; a place named only with `locations.view`. */
  balances!: LotBalance[];
  /** On hand where it can be used, as the trace's own `usable`. */
  usable!: string;
  /** The rest of what it holds, as the trace's own `notUsable`. */
  notUsable!: string;
}

/**
 * How it came to exist: received, against an order or with none, made by
 * a run, with the licence the run was released under (ADR-050), or put
 * into it by a lot change (ADR-094, R21).
 */
export class LotSource {
  @ApiProperty({ enum: LOT_SOURCE_KINDS })
  kind!: LotSourceKind;
  /**
   * The movement's detail, as Movements sends it: why a receipt with no
   * order came (`opening`, `returned`, `sample`, `other`), or which lot
   * change (`lots_started`, `between_lots`, `from_before`); null for the
   * rest.
   */
  reasonDetail!: string | null;
  at!: Date;
  quantity!: string;
  orderId!: string | null;
  /** The order's own number (ADR-071); null with no order. */
  orderNumber!: string | null;
  orderReference!: string | null;
  /**
   * Who a receipt came from: the order's partner, or the partner a receipt
   * with no order names, a customer for stock brought back (ADR-094, E2);
   * null with neither.
   */
  partnerId!: string | null;
  /** That partner's name, as partnerId says; null with none. */
  supplierName!: string | null;
  /**
   * The lot a move between lots came from (ADR-094, R21); null for the
   * start of lot tracking, stock from before it, and every other kind.
   */
  fromLotId!: string | null;
  fromLotCode!: string | null;
  runId!: string | null;
  runReference!: string | null;
  licenceId!: string | null;
  licenceNumber!: string | null;
  licenceAuthority!: string | null;
  licenceStatusAtRelease!: ReleaseLicenceStatus | null;
  licenceOverrideReason!: string | null;
  licenceOverriddenByName!: string | null;
}

/**
 * A lot one run step away, or more, up or down the chain. A move between
 * lots is followed as the same stock (ADR-094, R21): a lot whose stock
 * moved from, or into, one in the chain is listed with its run and steps.
 */
export class RelatedLot {
  lotId!: string;
  code!: string;
  sku!: string;
  /** Steps away, counted in runs: 1 is a direct ingredient or batch. */
  depth!: number;
  runId!: string;
  runReference!: string | null;
}

/**
 * Someone who received it, anything made from it, or any lot its stock
 * moved into (ADR-094, R21), each row with the lot they received: the
 * lot it came through.
 */
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
  /** The supplier's own lot of that lot, as printed; else null (ADR-094). */
  lotSupplierLot!: string | null;
  /** True when that lot's code was made here, not printed (ADR-094). */
  lotIsAssigned!: boolean;
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
  /**
   * The lots its stock moved on to, each by its code, with what each
   * holds now (ADR-094, S9); empty where none of it moved.
   */
  movedOnTo!: MovedOnLot[];
  sources!: LotSource[];
  madeFrom!: RelatedLot[];
  wentInto!: RelatedLot[];
  recipients!: LotRecipient[];
}
