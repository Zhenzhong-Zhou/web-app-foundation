/**
 * Shapes the server returns, shared rather than redeclared per feature.
 *
 * Location was declared twice — once in locations-page for the tree, once in
 * inventory-page for the picker — with different fields. Nothing compares the
 * two, so they would drift silently until a component read a property the
 * other's rows did not carry.
 *
 * These describe the API's responses, not the database. A column the client
 * never reads does not belong here.
 */
export interface Location {
  id: string;
  type: string;
  name: string;
  code: string | null;
  parentId: string | null;
  isAvailable: boolean;
  isActive: boolean;
}

export interface Movement {
  id: string;
  /** Snapshotted at the time (ADR-023) — not joined from the variant. */
  sku: string;
  quantity: string;
  reason: string;
  reasonDetail: string | null;
  note: string | null;
  fromLocationName: string | null;
  toLocationName: string | null;
  lotCode: string | null;
  /** Null when the actor was anonymised (ADR-012). */
  actorEmail: string | null;
  createdAt: string;
}

export interface MovementPage {
  entries: Movement[];
  nextCursor: string | null;
}

export interface StockRow {
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  unitOfMeasure: string;
  locationId: string;
  locationName: string;
  lotId: string | null;
  lotCode: string | null;
  lotExpiresAt: string | null;
  lotIsAssigned: boolean | null;
  /** A decimal string from numeric(18, 4). Never parsed — see ADR-025. */
  quantity: string;
}

export interface Partner {
  id: string;
  name: string;
  code: string | null;
  taxId: string | null;
  notes: string | null;
  isActive: boolean;
}

export interface Address {
  id: string;
  label: string | null;
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
  isBilling: boolean;
  isShipping: boolean;
  isDefault: boolean;
  isActive: boolean;
}

export interface Contact {
  id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  isPrimary: boolean;
  isActive: boolean;
}

/** What GET /partners/:id returns — the partner with its children embedded. */
export interface PartnerDetail extends Partner {
  addresses: Address[];
  contacts: Contact[];
}

export type OrderDirection = 'purchase' | 'sale';

/**
 * One lifecycle for both directions (ADR-041). `fulfilled` reads as
 * "Received" on a purchase and "Shipped" on a sale.
 */
export type OrderStatus = 'draft' | 'confirmed' | 'fulfilled' | 'cancelled';

export interface OrderSummary {
  id: string;
  partnerId: string;
  partnerName: string;
  direction: OrderDirection;
  /** A sale sent as a sample (ADR-042). Always false on a purchase. */
  isSample: boolean;
  status: OrderStatus;
  reference: string | null;
  expectedAt: string | null;
  createdAt: string;
  lineCount: number;
  /** numeric(18,4) as a string — never parsed into a JS number (ADR-025). */
  quantityOrdered: string;
  quantityFulfilled: string;
}

export interface OrderPage {
  entries: OrderSummary[];
  nextCursor: string | null;
}

export interface ProductionRunPage {
  entries: ProductionRun[];
  nextCursor: string | null;
}

export interface Lot {
  id: string;
  code: string;
  expiresAt: string | null;
  /** True when the receiver invented the code — see MovementLotDto. */
  isAssigned: boolean;
}

/** The flat variant list behind any picker — stock hangs off variants, not products (ADR-023). */
export interface VariantOption {
  id: string;
  sku: string;
  variantName: string | null;
  productName: string;
  type: string;
  unitOfMeasure: string;
  tracksLots: boolean;
}

export interface OrderLine {
  id: string;
  variantId: string;
  /** Snapshotted when the order was raised (ADR-023). */
  sku: string;
  description: string;
  quantityOrdered: string;
  quantityFulfilled: string;
  /** Customer returns, beside fulfilled rather than subtracted (ADR-043). */
  quantityReturned: string;
  quantityOutstanding: string;
  unitPrice: string | null;
  currency: string | null;
  lineTotal: string | null;
  isComplete: boolean;
  /** No more is coming (ADR-034). The quantities above stay as they were. */
  isClosedShort: boolean;
  closedReason: string | null;
}

/** What GET /orders/:id returns — the order with its lines. */
export interface OrderDetail {
  id: string;
  partnerId: string;
  partnerName: string;
  direction: OrderDirection;
  /** A sale sent as a sample (ADR-042). Always false on a purchase. */
  isSample: boolean;
  /** Every line received or shipped, or closed short. */
  fullyFulfilled: boolean;
  /** Set when this order was raised by duplicating another (ADR-031). */
  duplicatedFromId: string | null;
  status: OrderStatus;
  reference: string | null;
  expectedAt: string | null;
  totals: { currency: string; amount: string }[];
  totalsComplete: boolean;
  note: string | null;
  lines: OrderLine[];
}

export type BomStatus = 'draft' | 'active' | 'archived';

/** A recipe header. Lines arrive only from GET /boms/:id (ADR-029). */
/** A registration a formulation is made and sold under: an NPN, a DIN. */
export interface ProductLicence {
  id: string;
  number: string;
  authority: string;
  isActive: boolean;
  /** When it took effect. Null when nobody recorded it. */
  issuedAt: string | null;
  /** Null for schemes that do not expire, which includes an NPN. */
  expiresAt: string | null;
  notes: string | null;
}

export interface Bom {
  id: string;
  outputVariantId: string;
  /** Yield: what one batch makes, not an amount per unit. */
  outputQuantity: string;
  version: number;
  status: BomStatus;
  licenceId: string | null;
  notes: string | null;
}

export interface BomLine {
  id: string;
  componentVariantId: string;
  /** In the component variant's own unit — bom_lines carries no unit column. */
  quantity: string;
  supplyType: 'stocked' | 'external';
  notes: string | null;
}

/** What GET /boms/:id returns — the recipe with its components. */
export interface BomDetail extends Bom {
  lines: BomLine[];
  /**
   * True once a run has been made against a promoted recipe. Until then the
   * licence can still be attached — an NPN often arrives after the
   * formulation is settled (ADR-029).
   */
  licenceLocked: boolean;
}

export type RunStatus = 'draft' | 'released' | 'completed' | 'cancelled';

export interface ProductionRun {
  id: string;
  outputVariantId: string;
  bomId: string | null;
  partnerId: string | null;
  locationId: string;
  quantityPlanned: string;
  quantityProduced: string;
  status: RunStatus;
  /** What people call this run: a batch number, a co-packer's works order. */
  reference: string | null;
  /** Copied at release, so it says what the batch was made under then. */
  licenceNumber: string | null;
  licenceAuthority: string | null;
  notes: string | null;
  createdAt: string;
}

export interface RunLine {
  id: string;
  componentVariantId: string;
  /** Snapshotted at release — not joined from the variant (ADR-029). */
  sku: string;
  unitOfMeasure: string;
  quantityPlanned: string;
  quantityConsumed: string;
  supplyType: 'stocked' | 'external';
  sourceLocationId: string | null;
  externalLotCode: string | null;
}

/**
 * One lot of one component, as it went into a run: the recall trail
 * (ADR-039). Issued includes top-ups; consumed is filled in at close.
 */
export interface ComponentLot {
  componentVariantId: string;
  lotId: string;
  code: string;
  expiresAt: string | null;
  issued: string;
  consumed: string;
}

export interface RunDetail extends ProductionRun {
  lines: RunLine[];
  componentLots: ComponentLot[];
  /** Lot ids, read from the run's production movements (ADR-032). */
  outputLots: string[];
}

/** A lot at the source, with what earliest-expiry-first would take from it. */
export interface IssuePlanLot {
  lotId: string;
  code: string;
  expiresAt: string | null;
  onHand: string;
  take: string;
  taken: boolean;
}

/** One recipe line as release would issue it, before anything moves. */
export interface IssuePlanLine {
  componentVariantId: string;
  sku: string;
  unitOfMeasure: string;
  tracksLots: boolean;
  supplyType: 'stocked' | 'external';
  quantity: string;
  lots: IssuePlanLot[];
  /** How much the source is missing, or null when it can cover the line. */
  shortBy: string | null;
}

/** The batch against its own plan, when it is far enough off to say so. */
export interface OutputVariance {
  quantityPlanned: string;
  quantityProduced: string;
  variance: number;
}

export interface LineVariance {
  lineId: string;
  componentVariantId: string;
  /** Snapshotted on the line at release — a UUID reads as nothing on screen. */
  sku: string;
  quantityPlanned: string;
  quantityConsumed: string;
  variance: number;
}

/**
 * One line as a shipment would send it, with the lots earliest expiry first
 * would take (ADR-041). The same shape as a release preview, per order line.
 */
export interface ShipmentPlanLine {
  lineId: string;
  sku: string;
  quantity: string;
  tracksLots: boolean;
  lots: IssuePlanLot[];
  /** What the source is missing, or null when it can cover the line. */
  shortBy: string | null;
  /** More than the line still has outstanding: the ship would be refused. */
  exceedsOutstanding: boolean;
}

/** A shipment as its order page lists it: the header and what it carried. */
export interface Shipment {
  id: string;
  fromLocationId: string;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
  /** Set when a shipment recorded too early was voided (ADR-041); null otherwise. */
  voidedAt: string | null;
  voidReason: string | null;
  createdAt: string;
  items: {
    sku: string;
    /** Null for untracked stock, which ships without a lot. */
    lotCode: string | null;
    expiresAt: string | null;
    quantity: string;
    /** From the catalogue, beside the snapshotted SKU. */
    description: string;
    unitOfMeasure: string;
  }[];
}

/** Everything a packing slip prints, from one read (ADR-041). */
export interface PackingSlip {
  id: string;
  createdAt: string;
  carrier: string | null;
  trackingNumber: string | null;
  note: string | null;
  /** Set when a shipment recorded too early was voided (ADR-041); null otherwise. */
  voidedAt: string | null;
  voidReason: string | null;
  fromLocationName: string;
  organizationName: string;
  order: { id: string; reference: string | null; partnerName: string };
  /** The order's snapshot; null when it was raised without a destination. */
  shipTo: {
    label: string | null;
    line1: string;
    line2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    country: string | null;
  } | null;
  items: Shipment['items'];
}

/** A lot that shipped on an order, with how much has come back (ADR-043). */
export interface ReturnableLot {
  lotId: string;
  code: string;
  expiresAt: string | null;
  shipped: string;
  returned: string;
}

/** One shipped line, as the return dialog offers it. */
export interface ReturnableLine {
  lineId: string;
  sku: string;
  unitOfMeasure: string;
  tracksLots: boolean;
  quantityFulfilled: string;
  quantityReturned: string;
  /** Only lots that shipped on this order; empty when untracked. */
  lots: ReturnableLot[];
}

/** A return as its order page lists it: the header and what came back. */
export interface OrderReturn {
  id: string;
  toLocationId: string;
  reason: string | null;
  note: string | null;
  createdAt: string;
  items: Shipment['items'];
}

/** A lot matched by the start of its code (ADR-044). */
export interface LotMatch {
  id: string;
  code: string;
  expiresAt: string | null;
  sku: string;
}

/** A lot connected through production, up or down the chain. */
export interface RelatedLot {
  lotId: string;
  code: string;
  sku: string;
  /** Steps away: 1 is a direct ingredient or batch. */
  depth: number;
  runId: string;
  runReference: string | null;
}

/** One lot's whole story, read from the ledger (ADR-044). */
export interface LotTrace {
  lot: {
    id: string;
    code: string;
    expiresAt: string | null;
    sku: string;
    unitOfMeasure: string;
    description: string;
  };
  balances: {
    locationId: string;
    locationName: string;
    isAvailable: boolean;
    quantity: string;
  }[];
  sources: {
    kind: 'receipt' | 'production';
    at: string;
    quantity: string;
    orderId: string | null;
    orderReference: string | null;
    supplierName: string | null;
    runId: string | null;
    runReference: string | null;
    licenceNumber: string | null;
    licenceAuthority: string | null;
  }[];
  madeFrom: RelatedLot[];
  wentInto: RelatedLot[];
  /** Everyone who received it or anything made from it. */
  recipients: {
    /** Null when it left with no recipient on record. */
    partnerId: string | null;
    partnerName: string | null;
    orderId: string | null;
    orderReference: string | null;
    isSampleOrder: boolean;
    lotId: string;
    lotCode: string;
    sku: string;
    shipped: string;
    sampled: string;
    returned: string;
  }[];
}

/** Per product across available locations (ADR-045). */
export interface Availability {
  variantId: string;
  sku: string;
  unitOfMeasure: string;
  /** Stock at locations marked available: what could be promised. */
  onHand: string;
  /** Held for confirmed sales, earliest confirmed first. */
  held: string;
  /** Neither held nor unavailable: free to promise, sample or use. */
  free: string;
  /** Wanted by confirmed sales beyond what exists. */
  backordered: string;
}

/** One confirmed sale line's hold (ADR-045). */
export interface LineHold {
  lineId: string;
  outstanding: string;
  held: string;
  short: string;
}
