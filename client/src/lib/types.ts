import type {
  Bom,
  InvoiceSummary,
  LotCostEntry,
  OrderSummary,
  PriceList,
} from '../api/types.gen';
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
 * never reads does not belong here. Module by module, they are becoming
 * re-exports of the types generated from the server's OpenAPI document
 * (ADR-068), which the compiler holds to what the server sends.
 */

/**
 * A calendar day, YYYY-MM-DD, as the API sends and takes it (ADR-052): an
 * expiry, an expected delivery, a licence's dates. Not a moment, so never
 * read in the browser's time zone; formatDay shows one. A date input's value
 * is already this shape, so a form sends it as typed.
 */
export type CalendarDay = string;

/**
 * Recipes and price lists, generated from the server's OpenAPI document
 * (ADR-068), re-exported so their importers need no change.
 */
export type {
  Bom,
  BomDetail,
  BomLine,
  PriceList,
  PriceListDetail,
  PriceListItem,
} from '../api/types.gen';

/** A recipe's lifecycle (ADR-029), read from the generated recipe. */
export type BomStatus = Bom['status'];

/** Which side of a sale a list prices (ADR-049). */
export type PriceListDirection = PriceList['direction'];

/**
 * Products' images, the variant picker's options and product licences,
 * generated from the server's OpenAPI document (ADR-068).
 */
export type {
  ProductImage,
  ProductLicence,
  VariantOption,
} from '../api/types.gen';

/**
 * Stock, lots, movements and locations, generated from the server's
 * OpenAPI document (ADR-068, phase 2), re-exported so their importers need
 * no change.
 */
export type {
  Location,
  Lot,
  LotMatch,
  Movement,
  MovementPage,
  StockCounts,
  StockPage,
  StockRow,
} from '../api/types.gen';

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

/**
 * Orders, generated from the server's OpenAPI document (ADR-068, phase 2),
 * re-exported so their importers need no change. Direction and status are
 * read from the generated summary: one lifecycle for both directions
 * (ADR-041), where `fulfilled` reads as "Received" on a purchase and
 * "Shipped" on a sale.
 */
export type {
  OrderCreditRow,
  OrderDetail,
  OrderInvoiceRow,
  OrderLine,
  OrderMoney,
  OrderPage,
  OrderSummary,
} from '../api/types.gen';

export type OrderDirection = OrderSummary['direction'];

export type OrderStatus = OrderSummary['status'];

/**
 * Tax codes, generated from the server's OpenAPI document (ADR-068, the
 * phase 2 pilot). Re-exported here so their importers need no change; each
 * module's types move out of this file the same way as it is converted.
 */
export type { TaxCode, TaxCodeComponent } from '../api/types.gen';

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
  /** Branding (ADR-060): the logo file, the saved accent, the rail. */
  logoFileId: string | null;
  accentColor: string | null;
  rail: 'dark' | 'light';
  logoOnDocuments: boolean;
  /** When a lot counts as expiring here (ADR-060). */
  expiryWarningDays: number;
  expiryCriticalDays: number;
  /** Sign out after inactivity (ADR-065): minutes, or null for Off. */
  idleSignOutMinutes: number | null;
  idleSignOutScope: 'unticked' | 'everyone';
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

/**
 * Invoices and credit notes, generated from the server's OpenAPI document
 * (ADR-068, phase 2), re-exported so their importers need no change.
 * CreditNoteSummary is the credit notes list's row; an invoice's own list
 * of credit notes is InvoiceCreditNote. Written by hand, the two had one
 * name, and TypeScript merged them into a type neither response matched.
 */
export type {
  CreditNoteDetail,
  CreditNoteSummary,
  CreditPreview,
  InvoiceAmounts,
  InvoiceCreditNote,
  InvoiceDetail,
  InvoiceLine,
  InvoicePage,
  InvoiceSummary,
  InvoiceTax,
} from '../api/types.gen';

export type InvoiceStatus = InvoiceSummary['status'];

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
 * An order's shipments, returns and the plans behind them, generated from
 * the server's OpenAPI document (ADR-068, phase 2), re-exported so their
 * importers need no change.
 */
export type {
  OrderReturn,
  PackingSlip,
  ReturnableLine,
  ReturnableLot,
  Shipment,
  ShipmentPlanLine,
} from '../api/types.gen';

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

/** Stock availability and a sale line's hold (ADR-045), generated (ADR-068). */
export type { Availability, LineHold } from '../api/types.gen';

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

/**
 * What stock, lots and batches cost (ADR-048), generated from the server's
 * OpenAPI document (ADR-068, phase 2), re-exported so their importers need
 * no change.
 */
export type {
  CorrectedCost,
  ExchangeRate,
  LotCost,
  LotCostEntry,
  NeedsCostEntry,
  NeedsCostPage,
  RunCost,
  StockValuation,
} from '../api/types.gen';

export type ValuationKind = LotCostEntry['kind'];

/** Kinds of record the top bar's lookup finds (ADR-056). */
export type LookupKind =
  | 'order'
  | 'invoice'
  | 'creditNote'
  | 'lot'
  | 'item'
  | 'partner'
  | 'productionRun'
  | 'returnAuthorization';

/** One record the lookup found; the client builds its address. */
export interface LookupResult {
  id: string;
  title: string;
  detail: string | null;
  status: string | null;
  expiresAt: CalendarDay | null;
  productId: string | null;
  /** An item's product's cover (ADR-066); null for other kinds. */
  coverFileId: string | null;
  /** Found by similarity, after the exact matches: a typo. */
  close: boolean;
}

/** What GET /lookup returns: kinds in the order to show them. */
export interface LookupResponse {
  groups: { kind: LookupKind; results: LookupResult[] }[];
}

/** Home's cards (ADR-058), in the order of a working day. */
export type HomeKind =
  | 'toShip'
  | 'toReceive'
  | 'expiring'
  | 'costsWaiting'
  | 'invoicesToIssue'
  | 'returnsOpen'
  | 'production'
  | 'licences';

export interface HomeRow {
  id: string;
  title: string;
  detail: string | null;
  due: CalendarDay | null;
  late: boolean;
}

export interface HomeCard {
  kind: HomeKind;
  count: number;
  late: number;
  rows: HomeRow[];
}

export type GettingStartedStep =
  | 'organization'
  | 'location'
  | 'product'
  | 'partner'
  | 'receipt'
  | 'invoice'
  | 'team';

export interface HomeResponse {
  gettingStarted: {
    steps: Record<GettingStartedStep, boolean>;
    teamSkipped: boolean;
    dismissed: boolean;
    complete: boolean;
  };
  cards: HomeCard[];
}
