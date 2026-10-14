import type { Locale } from '../../../common/locales';
import type { OrganizationRail } from '../../../database/schema';
import type { Permission } from '../../authorization/permissions';

/**
 * The signed-in person's own account as the API returns it (ADR-068):
 * who they are, where they are signed in, and the organization they are
 * working in. Described for the OpenAPI document by the CLI plugin.
 */

/** The person, as every page load sees them. */
export class SessionUser {
  id!: string;
  email!: string;
  name!: string;
  emailVerified!: boolean;
  /** Null follows the browser (ADR-054). */
  locale!: Locale | null;
  /** Their photo (ADR-063), or null. */
  photoFileId?: string | null;
  /**
   * The deletion day, YYYY-MM-DD, while one is pending (ADR-069): every
   * page says so.
   */
  deletionScheduledAt?: string | null;
}

/** The organization's look, applied on load (ADR-060). */
export class OrganizationBranding {
  logoFileId!: string | null;
  accentColor!: string | null;
  rail!: OrganizationRail;
  logoOnDocuments!: boolean;
  /** When a lot counts as expiring here (ADR-060). */
  expiryWarningDays!: number;
  expiryCriticalDays!: number;
}

/** The organization the session is working in, and the role it holds. */
export class SessionOrganization {
  id!: string;
  name!: string;
  roleId!: string;
  branding!: OrganizationBranding;
}

/** GET /auth/me: everything the app needs to start. */
export class CurrentSession {
  user!: SessionUser;
  /** Null when the person belongs to no organization yet. */
  organization!: SessionOrganization | null;
  permissions!: Permission[];
  /** Sign out after this long idle (ADR-065), or null for never. */
  idleLimitMs?: number | null;
}

/** Who registered or signed in. */
export class AuthenticatedUser {
  id!: string;
  email!: string;
  name!: string;
  emailVerified!: boolean;
  locale!: Locale | null;
  /** Null when the person belongs to no organization. */
  organizationId!: string | null;
}

/** POST /auth/register and /auth/login. */
export class AuthenticatedUserEnvelope {
  user!: AuthenticatedUser;
}

/** POST /auth/verify-email. */
export class VerifiedEmail {
  verified!: boolean;
}

/**
 * Sending a verification or reset email. Always true for a reset, whether
 * or not the address is known, so the answer cannot tell anyone which
 * addresses have accounts.
 */
export class SentEmail {
  sent!: boolean;
}

/** POST /account/password: how many other devices were signed out. */
export class PasswordChanged {
  otherSessionsRevoked!: number;
}

/** One device the person is signed in on. */
export class SessionSummary {
  id!: string;
  issuedAt!: Date;
  lastSeenAt!: Date;
  expiresAt!: Date;
  ip!: string | null;
  /** "Chrome", "Safari": null when the agent was absent or unrecognised. */
  browser!: string | null;
  /** "macOS", "Windows", "iOS". */
  os!: string | null;
  /** The session making this request. The UI disables revoking it. */
  current!: boolean;
}

/** POST /account/photo: the photo now set. */
export class PhotoSet {
  photoFileId!: string;
}
