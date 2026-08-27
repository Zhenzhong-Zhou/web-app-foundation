import { Inject, Injectable } from '@nestjs/common';
import { eq } from 'drizzle-orm';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { permissions, rolePermissions } from '../../database/schema';
import type { Permission } from './permissions';

/**
 * Resolves which permissions a role grants (ADR-004, ADR-016).
 *
 * One place, because two callers need it and they need it differently: the
 * guard asks whether a set is held, and /v1/auth/me asks for the whole list so
 * the SPA can decide what to render. Two copies of this join would drift.
 *
 * Never cached — see ADR-016. A demoted user must lose access on their next
 * request, not at session expiry.
 *
 * Uses the unscoped handle: `permissions` has no organization_id (it is a
 * fixed catalogue), and role_permissions is reached through a role id the
 * membership already proved belongs to this organization.
 */
@Injectable()
export class PermissionsService {
  constructor(@Inject(UNSAFE_GLOBAL_DB) private readonly db: Database) {}

  async listForRole(roleId: string): Promise<Permission[]> {
    const rows = await this.db
      .select({ key: permissions.key })
      .from(rolePermissions)
      .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
      .where(eq(rolePermissions.roleId, roleId));

    return rows.map((row) => row.key as Permission);
  }
}
