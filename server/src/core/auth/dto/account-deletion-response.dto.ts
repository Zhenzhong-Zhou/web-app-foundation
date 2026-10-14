import type { Locale } from '../../../common/locales';
import type { AccountEvent } from './account-event-response.dto';
import type { SessionSummary } from './auth-response.dto';

/**
 * Deleting your account and exporting your data, as the API returns them
 * (ADR-068, ADR-069), described for the OpenAPI document by the CLI plugin.
 */

/** POST /account/deletion: when the account will be deleted. */
export class DeletionScheduled {
  deletionScheduledAt!: Date;
}

/** Who the person is, as the account holds it. */
export class ExportedProfile {
  id!: string;
  email!: string;
  name!: string;
  locale!: Locale | null;
  emailVerifiedAt!: Date | null;
  createdAt!: Date;
  /** Set while a deletion is pending (ADR-069). */
  deletionScheduledAt!: Date | null;
}

/** One organization the person belongs to, and their details there. */
export class ExportedMembership {
  organizationId!: string;
  organizationName!: string;
  roleName!: string;
  jobTitle!: string | null;
  department!: string | null;
  location!: string | null;
  workPhone!: string | null;
  extension!: string | null;
  joinedAt!: Date;
}

/** A notification as it was stored for the person. */
export class ExportedNotification {
  id!: string;
  organizationId!: string | null;
  type!: string;
  title!: string;
  body!: string | null;
  readAt!: Date | null;
  createdAt!: Date;
}

/** A record the person opened recently (ADR-058). */
export class ExportedRecent {
  organizationId!: string;
  kind!: string;
  recordId!: string;
  openedAt!: Date;
}

/**
 * GET /account/export: what is the person's own. Not an organization's
 * business records or its audit log, which belong to the organization.
 */
export class AccountExport {
  exportedAt!: Date;
  profile!: ExportedProfile;
  memberships!: ExportedMembership[];
  devices!: SessionSummary[];
  accountHistory!: AccountEvent[];
  notifications!: ExportedNotification[];
  recentlyOpened!: ExportedRecent[];
}
