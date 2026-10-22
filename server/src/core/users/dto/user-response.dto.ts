import type { RoleRef } from '../../authorization/dto/role-response.dto';
import type { ActiveSince } from '../../people/people.service';

/**
 * The organization's members as the API returns them (ADR-068), described
 * for the OpenAPI document by the CLI plugin.
 */

/** One member, as the members page lists them (ADR-063). */
export class Member {
  id!: string;
  email!: string;
  name!: string;
  /** Every role they hold, the built-in one first (ADR-080). */
  roles!: RoleRef[];
  /** Their photo; null shows their initials. */
  photoFileId?: string | null;
  /** How recently they were here, as everyone may see it. */
  active!: ActiveSince;
  /** The time itself, only for those who may read the history. */
  lastActiveAt?: Date | null;
}
