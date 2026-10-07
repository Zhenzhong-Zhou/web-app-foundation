import type { Locale } from './locales';

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

/**
 * A calendar day, YYYY-MM-DD, as the API sends and takes it (ADR-052): an
 * expiry, an expected delivery, a licence's dates. Not a moment, so never
 * read in the browser's time zone; formatDay shows one. A date input's value
 * is already this shape, so a form sends it as typed.
 */
export type CalendarDay = string;

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

export interface StockRow {
  /** The stock row itself; also the list's cursor (ADR-051). */
  id: string;
  variantId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  unitOfMeasure: string;
  locationId: string;
  locationName: string;
  lotId: string | null;
  lotCode: string | null;
  lotExpiresAt: CalendarDay | null;
  lotIsAssigned: boolean | null;
  /** A decimal string from numeric(18, 4). Never parsed — see ADR-025. */
  quantity: string;
}

export interface Partner {
  id: string;
  name: string;
  code: string | null;
  taxId: string | null;
  /** The lists this partner's orders take default prices from (ADR-049). */
  salePriceListId: string | null;
  purchasePriceListId: string | null;
  /**
   * What its documents print in (ADR-054). Null on the first means the
   * organization's pair; the second is only ever set with a first.
   */
  documentLanguage: Locale | null;
  documentSecondLanguage: Locale | null;
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
  expectedAt: CalendarDay | null;
  createdAt: string;
  lineCount: number;
  /** numeric(18,4) as a string — never parsed into a JS number (ADR-025). */
  quantityOrdered: string;
  quantityFulfilled: string;
}

export interface Lot {
  id: string;
  code: string;
  expiresAt: CalendarDay | null;
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
  /**
   * Credited on a credit note, voiding's left out (ADR-055): beside
   * Returned, the gap is what nobody has settled. Zero on a purchase.
   */
  quantityCredited: string;
  /** On returns with no RMA yet (ADR-047). Zero on a purchase or sample. */
  quantityUnsettled: string;
  quantityOutstanding: string;
  unitPrice: string | null;
  currency: string | null;
  /** Where the price came from (ADR-049): a list, typed, or not yet priced. */
  priceSource: 'list' | 'manual' | null;
  priceListId: string | null;
  /** The list's current name, for "from Wholesale CAD". */
  priceListName: string | null;
  lineTotal: string | null;
  isComplete: boolean;
  /** No more is coming (ADR-034). The quantities above stay as they were. */
  isClosedShort: boolean;
  closedReason: string | null;
}

/**
 * A sale's money (ADR-055), summed by the server: never added up here.
 * Invoiced and credited include tax and count issued documents only;
 * not yet invoiced is before tax and unrounded, for formatMoney to round.
 */
export interface OrderMoney {
  currency: string | null;
  invoiced: string;
  credited: string;
  netInvoiced: string;
  notInvoiced: string;
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
  expectedAt: CalendarDay | null;
  totals: { currency: string; amount: string }[];
  totalsComplete: boolean;
  /** Null on a purchase or a sample: neither is invoiced here. */
  money: OrderMoney | null;
  /** Returns received with no RMA, nobody yet deciding what they settle. */
  unsettledReturns: number;
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
  issuedAt: CalendarDay | null;
  /** Null for schemes that do not expire, which includes an NPN. */
  expiresAt: CalendarDay | null;
  notes: string | null;
}

/** One tax a code charges (ADR-046). The rate is a percentage: "5.0000". */
export interface TaxCodeComponent {
  id: string;
  name: string;
  rate: string;
}

export interface TaxCode {
  id: string;
  name: string;
  isActive: boolean;
  /** Empty for an Exempt code, which charges nothing and says so. */
  components: TaxCodeComponent[];
}

export interface OrganizationAddress {
  line1: string;
  line2: string | null;
  city: string | null;
  region: string | null;
  postalCode: string | null;
  country: string;
}

/** What every invoice prints as the seller (ADR-046). */
export interface OrganizationProfile {
  id: string;
  name: string;
  slug: string;
  taxRegistrationNumber: string | null;
  /** Null until set; no invoice can be issued before it is. */
  address: OrganizationAddress | null;
  /** ISO 4217; null until set. Stock is valued in it (ADR-048). */
  baseCurrency: string | null;
  /** The sale list for customers with none of their own (ADR-049). */
  defaultSalePriceListId: string | null;
  /** What release does with a licence not yet in force (ADR-050). */
  licenceNotInForcePolicy: LicencePolicy;
  /** What release does with an expired licence (ADR-050). */
  licenceExpiredPolicy: LicencePolicy;
  /** Whether a recipe with no licence is refused at release. */
  licenceRequired: boolean;
  /** What documents print in, unless a partner says otherwise (ADR-054). */
  documentLanguage: Locale;
  documentSecondLanguage: Locale | null;
  /** Languages an invoice may not be issued in while a name is missing. */
  requiredNameLanguages: Locale[];
}

/**
 * What release does with a licence in a given state (ADR-050): refuse,
 * refuse unless someone with production.override_licence gives a reason, or
 * let it through.
 */
export type LicencePolicy = 'block' | 'override' | 'allow';

/**
 * A licence's state as a run records it at release. Withdrawn never
 * appears: release always refuses it. Null on a run released before this
 * was recorded, which reads as "not recorded", never as current.
 */
export type LicenceStatusAtRelease =
  'current' | 'expired' | 'not_in_force' | 'none';

/**
 * What release would do with a run's licence, as the issue plan previews it
 * (ADR-050). The server's reading, not the client's: release acts on this
 * one, so the dialog shows it rather than deriving its own.
 */
export interface LicenceCheck {
  licence: {
    id: string;
    number: string;
    authority: string;
    issuedAt: CalendarDay | null;
    expiresAt: CalendarDay | null;
  } | null;
  status: LicenceStatusAtRelease | 'withdrawn';
  outcome: 'allow' | 'override' | 'block';
}

/**
 * What a run was made under, and how it stood at release — the fields the
 * run page and the lot trace both show the same way.
 */
export interface LicenceAtReleaseFields {
  licenceId: string | null;
  licenceNumber: string | null;
  licenceAuthority: string | null;
  licenceStatusAtRelease: LicenceStatusAtRelease | null;
  licenceOverriddenByName: string | null;
  licenceOverrideReason: string | null;
}

export type InvoiceStatus = 'draft' | 'issued' | 'voided';

/** A row in the invoice list. The total is null until issued. */
export interface InvoiceSummary {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  orderId: string;
  shipmentId: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  total: string | null;
  createdAt: string;
}

export interface InvoicePage {
  entries: InvoiceSummary[];
  nextCursor: string | null;
}

export interface InvoiceLine {
  id: string;
  orderLineId: string;
  variantId: string;
  sku: string;
  description: string;
  quantity: string;
  unitPrice: string;
  taxCodeId: string | null;
  /** The live code name on a draft; the copy made at issue after that. */
  taxCodeName: string | null;
  /** Stored at issue; null on a draft, whose figures are in `preview`. */
  netAmount: string | null;
  /** The name in the second language, copied at issue (ADR-054). */
  secondDescription: string | null;
}

/** One tax line: summed per component and rounded once (ADR-046). */
export interface InvoiceTax {
  name: string;
  rate: string;
  taxableAmount: string;
  amount: string;
}

/** A draft's figures, computed the way issuing will store them. */
export interface InvoiceAmounts {
  lines: { id: string; netAmount: string }[];
  taxes: InvoiceTax[];
  subtotal: string;
  taxTotal: string;
  total: string;
}

export interface CreditNoteSummary {
  id: string;
  number: string;
  creditDate: string;
  reason: string;
  isVoid: boolean;
  total: string;
}

/** Who issued a document and who it is addressed to, as copied at issue. */
export interface DocumentParties {
  sellerName: string | null;
  sellerTaxNumber: string | null;
  sellerLine1: string | null;
  sellerLine2: string | null;
  sellerCity: string | null;
  sellerRegion: string | null;
  sellerPostalCode: string | null;
  sellerCountry: string | null;
  billToName: string | null;
  billToLine1: string | null;
  billToLine2: string | null;
  billToCity: string | null;
  billToRegion: string | null;
  billToPostalCode: string | null;
  billToCountry: string | null;
}

export interface InvoiceDetail extends DocumentParties {
  id: string;
  number: string | null;
  status: InvoiceStatus;
  orderId: string;
  orderReference: string | null;
  shipmentId: string;
  partnerId: string;
  partnerName: string;
  currency: string;
  invoiceDate: string | null;
  dueDate: string | null;
  note: string | null;
  subtotal: string | null;
  taxTotal: string | null;
  total: string | null;
  shipToLabel: string | null;
  shipToLine1: string | null;
  shipToLine2: string | null;
  shipToCity: string | null;
  shipToRegion: string | null;
  shipToPostalCode: string | null;
  shipToCountry: string | null;
  issuedAt: string | null;
  voidedAt: string | null;
  voidReason: string | null;
  lines: InvoiceLine[];
  /** Stored tax lines once issued; null on a draft. */
  taxes: InvoiceTax[] | null;
  /** A draft's figures; null once issued. */
  preview: InvoiceAmounts | null;
  creditNotes: CreditNoteSummary[];
  /**
   * What it prints in (ADR-054): stored at issue, and for a draft the pair
   * it would take today, so a draft's printout is the issued one's.
   */
  language: Locale;
  secondLanguage: Locale | null;
}

export interface CreditNoteDetail extends DocumentParties {
  id: string;
  number: string;
  invoiceId: string;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  creditDate: string;
  reason: string;
  isVoid: boolean;
  subtotal: string;
  taxTotal: string;
  total: string;
  lines: {
    id: string;
    invoiceLineId: string;
    sku: string;
    description: string;
    secondDescription: string | null;
    quantity: string;
    unitPrice: string;
    taxCodeName: string | null;
    netAmount: string;
  }[];
  taxes: InvoiceTax[];
  /** Its invoice's languages, copied when it was issued (ADR-054). */
  language: Locale;
  secondLanguage: Locale | null;
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
  licenceId: string | null;
  licenceNumber: string | null;
  licenceAuthority: string | null;
  /** Its state at release, and any override (ADR-050). */
  licenceStatusAtRelease: LicenceStatusAtRelease | null;
  licenceOverriddenBy: string | null;
  licenceOverrideReason: string | null;
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
  expiresAt: CalendarDay | null;
  issued: string;
  consumed: string;
}

export interface RunDetail extends ProductionRun {
  /** Who overrode the licence policy at release, by name. */
  licenceOverriddenByName: string | null;
  lines: RunLine[];
  componentLots: ComponentLot[];
  /** Lot ids, read from the run's production movements (ADR-032). */
  outputLots: string[];
}

/** A lot at the source, with what earliest-expiry-first would take from it. */
export interface IssuePlanLot {
  lotId: string;
  code: string;
  expiresAt: CalendarDay | null;
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

/** What GET /production-orders/:id/issue-plan returns. */
export interface IssuePlan {
  lines: IssuePlanLine[];
  licenceCheck: LicenceCheck;
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
    expiresAt: CalendarDay | null;
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
  /** What it prints in, fixed when it shipped (ADR-054). */
  language: Locale;
  secondLanguage: Locale | null;
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
  expiresAt: CalendarDay | null;
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
  /** The RMA it counts against, if any (ADR-047). */
  returnAuthorizationId: string | null;
  reason: string | null;
  note: string | null;
  createdAt: string;
  items: Shipment['items'];
}

/** A lot matched by the start of its code (ADR-044). */
export interface LotMatch {
  id: string;
  code: string;
  expiresAt: CalendarDay | null;
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
    expiresAt: CalendarDay | null;
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
  sources: ({
    kind: 'receipt' | 'production';
    at: string;
    quantity: string;
    orderId: string | null;
    orderReference: string | null;
    supplierName: string | null;
    runId: string | null;
    runReference: string | null;
  } & LicenceAtReleaseFields)[];
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

export type ReturnResolution = 'credit' | 'replace' | 'none';

export type ReturnAuthorizationStatus = 'open' | 'closed' | 'cancelled';

/** A row in the returns list (ADR-047). */
export interface ReturnAuthorizationSummary {
  id: string;
  number: string;
  status: ReturnAuthorizationStatus;
  orderId: string;
  orderReference: string | null;
  partnerId: string;
  partnerName: string;
  reason: string;
  expectsGoods: boolean;
  createdAt: string;
}

export interface ReturnAuthorizationPage {
  entries: ReturnAuthorizationSummary[];
  nextCursor: string | null;
}

/** One item on an RMA, with what has happened to it so far. */
export interface ReturnAuthorizationLine {
  id: string;
  orderLineId: string;
  variantId: string;
  sku: string;
  /** Authorized: the ceiling for returns and credits against this line. */
  quantity: string;
  resolution: ReturnResolution;
  quantityReceived: string;
  quantityCredited: string;
}

export interface ReturnAuthorizationDetail {
  id: string;
  number: string;
  status: ReturnAuthorizationStatus;
  orderId: string;
  orderReference: string | null;
  partnerId: string;
  partnerName: string;
  /** The invoice the customer quoted, if any; the credit defaults to it. */
  invoiceId: string | null;
  invoiceNumber: string | null;
  reason: string;
  /** False when the customer was told to keep or destroy the goods. */
  expectsGoods: boolean;
  note: string | null;
  createdAt: string;
  closedAt: string | null;
  cancelledAt: string | null;
  lines: ReturnAuthorizationLine[];
}

export type ValuationKind =
  'movement' | 'run_close' | 'correction' | 'issued' | 'opening';

/** What the stock on hand is worth, pool by pool (ADR-048). */
export interface StockValuation {
  /** Null until the organization has a base currency. */
  currency: string | null;
  total: string;
  /** True while anything below depends on a row still waiting for a cost. */
  provisional: boolean;
  pools: {
    variantId: string;
    sku: string;
    lotId: string | null;
    lotCode: string | null;
    quantity: string;
    value: string;
    unitCost: string;
    provisional: boolean;
  }[];
}

/** A valuation still waiting for a cost: the to-do list (ADR-048). */
export interface NeedsCostEntry {
  id: string;
  kind: ValuationKind;
  /** The movement's reason; null for the opening balance. */
  reason: string | null;
  sku: string;
  variantId: string;
  lotId: string | null;
  lotCode: string | null;
  quantity: string;
  /** Set when a price is known but its rate is not. */
  unitPrice: string | null;
  currency: string | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/** One currency's rate into the base currency, for one day. */
export interface ExchangeRate {
  id: string;
  currency: string;
  /** YYYY-MM-DD. */
  rateDate: string;
  rate: string;
}

/** What one batch cost to make: material only (ADR-048). */
export interface RunCost {
  currency: string | null;
  runId: string;
  reference: string | null;
  sku: string;
  status: 'draft' | 'released' | 'completed' | 'cancelled';
  closed: boolean;
  quantityProduced: string;
  /** Null until the run closes; consumption is written then. */
  materialCost: string | null;
  /** Null until close, and when nothing was made. */
  unitCost: string | null;
  provisional: boolean;
  consumed: {
    sku: string;
    lotCode: string | null;
    quantity: string;
    value: string;
  }[];
  outputs: { lotCode: string | null; quantity: string; value: string }[];
}

/** One valuation row in a lot's history. */
export interface LotCostEntry {
  id: string;
  kind: ValuationKind;
  reason: string | null;
  /** Signed: negative for stock leaving. */
  quantity: string;
  value: string;
  unitPrice: string | null;
  currency: string | null;
  exchangeRate: string | null;
  needsCost: boolean;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
}

/** What one lot is worth, and how it got there. */
export interface LotCost {
  currency: string | null;
  lotId: string;
  lotCode: string;
  sku: string;
  quantity: string;
  value: string;
  /** Null when none is on hand. */
  unitCost: string | null;
  provisional: boolean;
  entries: LotCostEntry[];
}

export type PriceListDirection = 'sale' | 'purchase';

/** A price list, as the list page and the pickers show it (ADR-049). */
export interface PriceList {
  id: string;
  name: string;
  direction: PriceListDirection;
  currency: string;
  isActive: boolean;
  itemCount: number;
}

export interface PriceListItem {
  variantId: string;
  sku: string;
  description: string;
  /** Per unit, net of tax, in the list's currency. */
  unitPrice: string;
  updatedAt: string;
}

export interface PriceListDetail extends Omit<PriceList, 'itemCount'> {
  items: PriceListItem[];
}
