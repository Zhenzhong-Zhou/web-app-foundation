import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import {
  organizations,
  permissions,
  rolePermissions,
  roles,
} from '../../database/schema';
import {
  SYSTEM_ROLE_DESCRIPTIONS,
  SYSTEM_ROLE_PERMISSIONS,
  SYSTEM_ROLES,
  type SystemRole,
} from '../authorization/permissions';

export interface ProvisionedOrganization {
  organizationId: string;
  /** Role name -> id, so the caller can attach an Owner membership. */
  roleIds: Record<SystemRole, string>;
}

/**
 * Creates an organization together with its three system roles and their
 * permission grants (ADR-004: roles are per-org).
 *
 * Takes a transaction handle rather than injecting the database, for two
 * reasons. ADR-004 requires registration to create user + org + Owner
 * membership atomically, so the caller owns the transaction. And provisioning
 * runs *before* any tenant exists, so it cannot go through TenantDb — taking
 * `tx` keeps this function clear of UNSAFE_GLOBAL_DB entirely.
 *
 * Shared by the seed and by registration; duplicating it would let the two
 * drift, and an organization seeded differently from one registered is a bug
 * that only surfaces in production.
 */
export async function provisionOrganization(
  tx: Transaction,
  input: { name: string; slug: string },
): Promise<ProvisionedOrganization> {
  const [organization] = await tx
    .insert(organizations)
    .values(input)
    .returning();

  const createdRoles = await tx
    .insert(roles)
    .values(
      Object.values(SYSTEM_ROLES).map((name) => ({
        organizationId: organization.id,
        name,
        description: SYSTEM_ROLE_DESCRIPTIONS[name],
        // Seeded roles the UI must not allow deleting: an org with no Owner
        // cannot be recovered.
        isSystem: true,
      })),
    )
    .returning();

  const permissionRows = await tx
    .select({ id: permissions.id, key: permissions.key })
    .from(permissions);

  const idByKey = new Map(permissionRows.map((p) => [p.key, p.id]));

  const grants = createdRoles.flatMap((role) =>
    SYSTEM_ROLE_PERMISSIONS[role.name as SystemRole].map((key) => {
      const permissionId = idByKey.get(key);

      if (!permissionId) {
        // Fail loudly. Silently skipping produces an organization whose Owner
        // is missing a permission, which surfaces later as an inexplicable 403.
        throw new Error(
          `Permission "${key}" is not seeded. Run the permission seed first.`,
        );
      }

      return { roleId: role.id, permissionId };
    }),
  );

  await tx.insert(rolePermissions).values(grants);

  return {
    organizationId: organization.id,
    roleIds: Object.fromEntries(
      createdRoles.map((r) => [r.name, r.id]),
    ) as Record<SystemRole, string>,
  };
}

/** True if an organization with this slug already exists. */
export async function organizationExists(
  tx: Transaction,
  slug: string,
): Promise<boolean> {
  const rows = await tx
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug));

  return rows.length > 0;
}
