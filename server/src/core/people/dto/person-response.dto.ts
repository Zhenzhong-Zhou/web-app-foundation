import type { AuditRecord } from '../../audit/dto/audit-response.dto';
import type { RoleRef } from '../../authorization/dto/role-response.dto';
import type { ActiveSince } from '../people.service';

/**
 * The organization's people as the API returns them (ADR-068, ADR-063),
 * described for the OpenAPI document by the CLI plugin.
 */

/** One of the organization's people, as the directory lists them. */
export class Person {
  id!: string;
  name!: string;
  email!: string;
  photoFileId!: string | null;
  /** Every role they hold, the built-in one first (ADR-080). */
  roles!: RoleRef[];
  jobTitle!: string | null;
  department!: string | null;
  location!: string | null;
  workPhone!: string | null;
  extension!: string | null;
  memberSince!: Date;
  /** How recently they were here, as everyone may see it. */
  active!: ActiveSince;
  /** The time itself, only for those who may read the history. */
  lastActiveAt?: Date | null;
}

/** GET /people/:id. */
export class PersonDetail extends Person {
  /**
   * The last 20 things they did here, for those who may read the history,
   * and never on your own page: your work is on your Account page.
   */
  recentActivity?: AuditRecord[];
}
