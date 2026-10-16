import type { Locale } from '../../../common/locales';
import type {
  IdleSignOutScope,
  LicencePolicy,
  OrganizationRail,
  PaperSize,
} from '../../../database/schema';

/**
 * The organization's own profile and settings as the API returns them
 * (ADR-068), described for the OpenAPI document by the CLI plugin.
 */

/** Its registered address, which every invoice prints (ADR-046). */
export class OrganizationAddress {
  line1!: string;
  line2!: string | null;
  city!: string | null;
  region!: string | null;
  postalCode!: string | null;
  country!: string;
}

/** The last full export (ADR-070, amended): when, and by whom. */
export class OrganizationLastExport {
  exportedAt!: Date;
  /** The person's name as it is now: Deleted User once they are gone. */
  exportedBy!: string;
  /** Who, by id: two members can share a name. */
  exportedById!: string;
  /**
   * Taken within the last 24 hours, so a deletion can rely on it
   * (ADR-070): the server's clock, not the browser's.
   */
  fresh!: boolean;
}

export class OrganizationProfile {
  id!: string;
  name!: string;
  slug!: string;
  taxRegistrationNumber!: string | null;
  /** Null until set; no invoice can be issued before it is. */
  address!: OrganizationAddress | null;
  /** ISO 4217; null until set. Stock is valued in it (ADR-048). */
  baseCurrency!: string | null;
  /** The sale list for customers with none of their own (ADR-049). */
  defaultSalePriceListId!: string | null;
  /** What release does with a licence in each state (ADR-050). */
  licenceNotInForcePolicy!: LicencePolicy;
  licenceExpiredPolicy!: LicencePolicy;
  licenceRequired!: boolean;
  /** What documents print in, unless a partner says otherwise (ADR-054). */
  documentLanguage!: Locale;
  documentSecondLanguage!: Locale | null;
  requiredNameLanguages!: Locale[];
  /** Branding (ADR-060). */
  logoFileId!: string | null;
  accentColor!: string | null;
  rail!: OrganizationRail;
  logoOnDocuments!: boolean;
  /** Letter or A4, or null for automatic from the country (ADR-071). */
  paperSize!: PaperSize | null;
  /** The IANA time zone that decides the organization's day (ADR-072). */
  timeZone!: string;
  expiryWarningDays!: number;
  expiryCriticalDays!: number;
  /** Sign out after inactivity (ADR-065): minutes, or null for off. */
  idleSignOutMinutes!: number | null;
  idleSignOutScope!: IdleSignOutScope;
  /**
   * The last full export, for those who can take one (ADR-070, amended);
   * null for everyone else, and before the first.
   */
  lastExport!: OrganizationLastExport | null;
}

/** GET /organization. */
export class OrganizationEnvelope {
  organization!: OrganizationProfile;
}
