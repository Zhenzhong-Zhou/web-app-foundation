import type { Locale } from '../../../common/locales';
import type {
  IdleSignOutScope,
  LicencePolicy,
  OrganizationRail,
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
  expiryWarningDays!: number;
  expiryCriticalDays!: number;
  /** Sign out after inactivity (ADR-065): minutes, or null for off. */
  idleSignOutMinutes!: number | null;
  idleSignOutScope!: IdleSignOutScope;
}

/** GET /organization. */
export class OrganizationEnvelope {
  organization!: OrganizationProfile;
}
