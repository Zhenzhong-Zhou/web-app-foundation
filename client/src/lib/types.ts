import type {
  Bom,
  HomeCard,
  HomeResponse,
  InvoiceSummary,
  LookupResponse,
  LotCostEntry,
  OrderSummary,
  OrganizationProfile,
  PriceList,
  ProductionRun,
  ReturnAuthorizationLine,
  ReturnAuthorizationSummary,
  RunDetail,
} from '../api/types.gen';

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
 * The organization's profile and registered address, generated from the
 * server's OpenAPI document (ADR-068).
 */
export type {
  OrganizationAddress,
  OrganizationProfile,
} from '../api/types.gen';

/**
 * Return authorizations (ADR-047), generated from the server's OpenAPI
 * document (ADR-068), re-exported so their importers need no change.
 */
export type {
  ReturnAuthorizationDetail,
  ReturnAuthorizationLine,
  ReturnAuthorizationPage,
  ReturnAuthorizationSummary,
} from '../api/types.gen';

export type ReturnResolution = ReturnAuthorizationLine['resolution'];

export type ReturnAuthorizationStatus = ReturnAuthorizationSummary['status'];

/**
 * Production runs, their issue plans and variances, and a lot's trace,
 * generated from the server's OpenAPI document (ADR-068), re-exported so
 * their importers need no change.
 */
export type {
  ComponentLot,
  IssuePlan,
  IssuePlanLine,
  IssuePlanLot,
  LicenceCheck,
  LineVariance,
  LotTrace,
  OutputVariance,
  ProductionRun,
  RelatedLot,
  RunDetail,
  RunLine,
} from '../api/types.gen';

export type RunStatus = ProductionRun['status'];

/** A licence's state when a run was released (ADR-050). */
export type LicenceStatusAtRelease = NonNullable<
  ProductionRun['licenceStatusAtRelease']
>;

/** What a run, and a lot's source, record of the licence at release. */
export type LicenceAtReleaseFields = Pick<
  RunDetail,
  | 'licenceId'
  | 'licenceNumber'
  | 'licenceAuthority'
  | 'licenceStatusAtRelease'
  | 'licenceOverriddenByName'
  | 'licenceOverrideReason'
>;

/**
 * Partners with their addresses and contacts, generated from the server's
 * OpenAPI document (ADR-068), re-exported so their importers need no
 * change.
 */
export type {
  Address,
  Contact,
  Partner,
  PartnerDetail,
} from '../api/types.gen';

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

/**
 * What release does with a licence in a given state (ADR-050): refuse,
 * refuse unless someone with production.override_licence gives a reason, or
 * let it through.
 */
export type LicencePolicy = OrganizationProfile['licenceExpiredPolicy'];

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

/** Stock availability and a sale line's hold (ADR-045), generated (ADR-068). */
export type { Availability, LineHold } from '../api/types.gen';

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

/**
 * The top bar's lookup and Home's cards, generated from the server's
 * OpenAPI document (ADR-068), re-exported so their importers need no
 * change.
 */
export type {
  HomeCard,
  HomeResponse,
  HomeRow,
  LookupResponse,
  LookupResult,
} from '../api/types.gen';

/** Kinds of record the top bar's lookup finds (ADR-056). */
export type LookupKind = LookupResponse['groups'][number]['kind'];

/** Home's cards (ADR-058), in the order of a working day. */
export type HomeKind = HomeCard['kind'];

export type GettingStartedStep = keyof HomeResponse['gettingStarted']['steps'];
