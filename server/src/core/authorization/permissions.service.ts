import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, exists, isNull, ne, type SQL } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import {
  membershipRoles,
  memberships,
  permissions,
  rolePermissions,
  users,
} from '../../database/schema';
import type { Permission } from './permissions';

/** A member who holds a permission, as whoever is told or asked names them. */
export interface Holder {
  id: string;
  name: string;
}

/**
 * The one place that decides (ADR-080): what a member may do, and who in
 * an organization may do something. The guard, every route that words a
 * page by what its reader may do, Home's whom to ask and the
 * notifications' recipients all ask here, so the answer cannot differ by
 * who asks it. A member may do whatever any of their roles allows.
 *
 * Never cached — see ADR-016. A demoted user must lose access on their next
 * request, not at session expiry, and a role changed reaches everyone
 * holding it on theirs.
 *
 * Uses the unscoped handle: `permissions` has no organization_id (it is a
 * fixed catalogue), and the grants are reached through a membership the
 * session already proved belongs to this organization, or through an
 * organization id the caller names.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

  /**
   * Everything a member may do: one indexed query from the membership
   * through its roles to their permissions. None for no membership, as a
   * request in no organization has.
   */
  async listForMember(membershipId: string | null): Promise<Permission[]> {
    if (!membershipId) return [];

    const rows = await this.db
      .selectDistinct({ key: permissions.key })
      .from(membershipRoles)
      .innerJoin(
        rolePermissions,
        eq(rolePermissions.roleId, membershipRoles.roleId),
      )
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(membershipRoles.membershipId, membershipId));

    return rows.map((row) => row.key as Permission);
  }

  /**
   * Everyone in an organization who may do this, through any of their
   * roles, each once, those who joined first first: whoever is told of
   * something, and whom to ask for more.
   */
  holdersOf(
    organizationId: string,
    permission: Permission,
    options: { except?: string; limit?: number } = {},
  ): Promise<Holder[]> {
    const conditions: SQL[] = [
      eq(memberships.organizationId, organizationId),
      isNull(users.deletedAt),
      exists(
        this.db
          .select({ key: permissions.key })
          .from(membershipRoles)
          .innerJoin(
            rolePermissions,
            eq(rolePermissions.roleId, membershipRoles.roleId),
          )
          .innerJoin(
            permissions,
            eq(permissions.id, rolePermissions.permissionId),
          )
          .where(
            and(
              eq(membershipRoles.membershipId, memberships.id),
              eq(permissions.key, permission),
            ),
          ),
      ),
    ];
    if (options.except) conditions.push(ne(memberships.userId, options.except));

    const query = this.db
      .select({ id: users.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(and(...conditions))
      .orderBy(asc(memberships.createdAt), asc(memberships.id));

    return options.limit ? query.limit(options.limit) : query;
  }
}
