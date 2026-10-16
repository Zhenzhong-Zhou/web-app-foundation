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
 * Names for the unions screens switch on, read from the types generated
 * out of the server's OpenAPI document (ADR-068). Never copies: each is
 * a field of a generated type, so a status the server adds reaches every
 * switch over it at compile time. The generated types themselves are
 * imported from ../api/types.gen directly.
 */

/**
 * A calendar day, YYYY-MM-DD, as the API sends and takes it (ADR-052): an
 * expiry, an expected delivery, a licence's dates. Not a moment, so never
 * read in the browser's time zone; formatDay shows one. A date input's value
 * is already this shape, so a form sends it as typed.
 */
export type CalendarDay = string;

export type BomStatus = Bom['status'];

export type GettingStartedStep = keyof HomeResponse['gettingStarted']['steps'];

/** Home's cards (ADR-058), in the order of a working day. */
export type HomeKind = HomeCard['kind'];

export type InvoiceStatus = InvoiceSummary['status'];

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

/** What release does with a licence in a given state (ADR-050). */
export type LicencePolicy = OrganizationProfile['licenceExpiredPolicy'];

/** A licence's state when a run was released (ADR-050). */
export type LicenceStatusAtRelease = NonNullable<
  ProductionRun['licenceStatusAtRelease']
>;

/** Kinds of record the top bar's lookup finds (ADR-056). */
export type LookupKind = LookupResponse['groups'][number]['kind'];

export type OrderDirection = OrderSummary['direction'];

/** The paper every document is drawn on (ADR-071); null is automatic. */
export type PaperSize = NonNullable<OrganizationProfile['paperSize']>;

/**
 * One lifecycle for both directions (ADR-041): `fulfilled` reads as
 * "Received" on a purchase and "Shipped" on a sale.
 */
export type OrderStatus = OrderSummary['status'];

/** Which side of a sale a list prices (ADR-049). */
export type PriceListDirection = PriceList['direction'];

export type ReturnAuthorizationStatus = ReturnAuthorizationSummary['status'];

export type ReturnResolution = ReturnAuthorizationLine['resolution'];

export type RunStatus = ProductionRun['status'];

export type ValuationKind = LotCostEntry['kind'];
