import type { Locale } from '../../../common/locales';

/**
 * An order's shipments, returns and their plans as the API returns them
 * (ADR-068): the fields the client reads, described for the OpenAPI
 * document by the CLI plugin.
 */

/** What a shipment carried, or a return brought back, by lot. */
export class ShipmentItem {
  sku!: string;
  /** From the catalogue: for the person unpacking, beside the SKU. */
  description!: string;
  unitOfMeasure!: string;
  /** Null for untracked stock, which moves without a lot. */
  lotCode!: string | null;
  expiresAt!: string | null;
  quantity!: string;
}

/** A shipment as its order page lists it: the header and what it carried. */
export class Shipment {
  id!: string;
  fromLocationId!: string;
  carrier!: string | null;
  trackingNumber!: string | null;
  note!: string | null;
  /** Set when a shipment recorded too early was voided (ADR-041). */
  voidedAt!: Date | null;
  voidReason!: string | null;
  createdAt!: Date;
  items!: ShipmentItem[];
}

export class SlipOrder {
  id!: string;
  /** Ours, SO- (ADR-071); `reference` is the customer's. */
  number!: string;
  reference!: string | null;
  partnerName!: string;
}

/** Where the goods went, as the order recorded it. */
export class SlipShipTo {
  label!: string | null;
  line1!: string;
  line2!: string | null;
  city!: string | null;
  region!: string | null;
  postalCode!: string | null;
  country!: string | null;
}

/** Everything a packing slip prints, from one read (ADR-041). */
export class PackingSlip {
  id!: string;
  createdAt!: Date;
  carrier!: string | null;
  trackingNumber!: string | null;
  note!: string | null;
  voidedAt!: Date | null;
  voidReason!: string | null;
  fromLocationName!: string;
  organizationName!: string;
  /** What it prints in, fixed when it shipped (ADR-054). */
  language!: Locale;
  secondLanguage!: Locale | null;
  order!: SlipOrder;
  /** The order's snapshot; null when it was raised without a destination. */
  shipTo!: SlipShipTo | null;
  items!: ShipmentItem[];
}

/** POST /orders/:id/shipments: the shipment, as its packing slip reads. */
export class ShipmentEnvelope {
  shipment!: PackingSlip;
}

/** A lot the plan would ship from, earliest expiry first. */
export class ShipmentPlanLot {
  lotId!: string;
  code!: string;
  expiresAt!: string | null;
  /** On hand at the location. */
  onHand!: string;
  /** What earliest-expiry-first takes from this lot; "0" when none. */
  take!: string;
  taken!: boolean;
}

export class ShipmentPlanLine {
  lineId!: string;
  sku!: string;
  quantity!: string;
  tracksLots!: boolean;
  /** Candidates at the source; empty when untracked. */
  lots!: ShipmentPlanLot[];
  /** What the source is missing, or null when it can cover the line. */
  shortBy!: string | null;
  /** More than the line still has outstanding: the ship would be refused. */
  exceedsOutstanding!: boolean;
}

/** POST /orders/:id/shipments/preview. */
export class ShipmentPlan {
  lines!: ShipmentPlanLine[];
}

/** A return as its order page lists it: the header and what came back. */
export class OrderReturn {
  id!: string;
  toLocationId!: string;
  /** The RMA it counts against, if any (ADR-047). */
  returnAuthorizationId!: string | null;
  reason!: string | null;
  note!: string | null;
  createdAt!: Date;
  items!: ShipmentItem[];
}

/** POST /orders/:id/returns: the return, as the order's list shows it. */
export class OrderReturnEnvelope {
  orderReturn!: OrderReturn;
}

/** A lot that shipped on an order, with how much has come back (ADR-043). */
export class ReturnableLot {
  lotId!: string;
  code!: string;
  expiresAt!: string | null;
  shipped!: string;
  returned!: string;
}

/**
 * What of a tracked line shipped with no lot, before its code's lot
 * tracking started, and how much of it has come back (ADR-094, Q3a): it
 * comes back by quantity, into the lot named here.
 */
export class ReturnableFromBefore {
  shipped!: string;
  returned!: string;
  /**
   * The lot it goes into: the one that took the code's stock as its lot
   * tracking started. Null where the code started with nothing on hand:
   * that lot is made for us when the first of it comes back.
   */
  lotId!: string | null;
  lotCode!: string | null;
}

/** One shipped line, as the return dialog offers it. */
export class ReturnableLine {
  lineId!: string;
  sku!: string;
  unitOfMeasure!: string;
  tracksLots!: boolean;
  quantityFulfilled!: string;
  quantityReturned!: string;
  /** Only lots that shipped on this order; empty when untracked. */
  lots!: ReturnableLot[];
  /**
   * What shipped with no lot before the code's lot tracking started; null
   * where none did, and for a code not tracked, which returns by quantity.
   */
  fromBefore!: ReturnableFromBefore | null;
}
