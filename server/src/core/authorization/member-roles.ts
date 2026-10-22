import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';

import type { Database, Transaction } from '../../database/database.module';
import {
  invitationRoles,
  membershipRoles,
  permissions,
  rolePermissions,
  roles,
} from '../../database/schema';
import type { RoleRef } from './dto/role-response.dto';
import type { Permission } from './permissions';

type Executor = Database | Transaction;

/** A role as a member holds it or an invitation names it (ADR-080). */
export interface HeldRole {
  id: string;
  name: string;
  /** A made role's line; null for a built-in role, worded by its key. */
  description: string | null;
  isSystem: boolean;
}

/** A role beside a member or an invitation, as the API sends it. */
export function roleRef(role: {
  id: string;
  name: string;
  isSystem: boolean;
}): RoleRef {
  return { id: role.id, name: role.name, builtIn: role.isSystem };
}

/**
 * The roles each membership holds (ADR-080), by membership id: the only
 * way outside core/authorization to read them, since a lint rule refuses
 * the table anywhere else. In the order the organization made them, so
 * the built-in three come first. The ids come from a query already scoped
 * to the organization, and the table's foreign keys hold every role to
 * its member's organization, so nothing here needs the tenant.
 */
export function rolesOfMembers(
  executor: Executor,
  membershipIds: readonly string[],
): Promise<Map<string, HeldRole[]>> {
  return grouped(
    membershipIds.length === 0
      ? Promise.resolve([])
      : executor
          .select({ of: membershipRoles.membershipId, ...ROLE })
          .from(membershipRoles)
          .innerJoin(roles, eq(roles.id, membershipRoles.roleId))
          .where(inArray(membershipRoles.membershipId, [...membershipIds]))
          .orderBy(asc(roles.id)),
  );
}

/** One membership's roles, the same way. */
export async function rolesOfMember(
  executor: Executor,
  membershipId: string,
): Promise<HeldRole[]> {
  return (
    (await rolesOfMembers(executor, [membershipId])).get(membershipId) ?? []
  );
}

/**
 * Rows naming a membership, each with that member's roles beside it as
 * the API sends them, and the membership id gone: Members, People and a
 * role's holders.
 */
export async function withRoleRefs<Row extends { membershipId: string }>(
  executor: Executor,
  rows: readonly Row[],
): Promise<(Omit<Row, 'membershipId'> & { roles: RoleRef[] })[]> {
  const held = await rolesOfMembers(
    executor,
    rows.map((row) => row.membershipId),
  );
  return rows.map(({ membershipId, ...row }) => ({
    ...row,
    roles: (held.get(membershipId) ?? []).map(roleRef),
  }));
}

/** The roles each invitation names, by invitation id, the same way. */
export function rolesOfInvitations(
  executor: Executor,
  invitationIds: readonly string[],
): Promise<Map<string, HeldRole[]>> {
  return grouped(
    invitationIds.length === 0
      ? Promise.resolve([])
      : executor
          .select({ of: invitationRoles.invitationId, ...ROLE })
          .from(invitationRoles)
          .innerJoin(roles, eq(roles.id, invitationRoles.roleId))
          .where(inArray(invitationRoles.invitationId, [...invitationIds]))
          .orderBy(asc(roles.id)),
  );
}

/** One invitation's roles, the same way. */
export async function rolesOfInvitation(
  executor: Executor,
  invitationId: string,
): Promise<HeldRole[]> {
  return (
    (await rolesOfInvitations(executor, [invitationId])).get(invitationId) ?? []
  );
}

/**
 * A new membership's roles. A role of another organization's is refused
 * by the database, as a foreign key violation: the caller has found each
 * role in its own organization first.
 */
export async function giveRoles(
  executor: Executor,
  membership: { id: string; organizationId: string },
  roleIds: readonly string[],
): Promise<void> {
  await executor.insert(membershipRoles).values(
    roleIds.map((roleId) => ({
      organizationId: membership.organizationId,
      membershipId: membership.id,
      roleId,
    })),
  );
}

/**
 * A member's roles made exactly these: those no longer listed taken away,
 * the new ones given, and those kept left as they were.
 */
export async function setRoles(
  executor: Executor,
  membership: { id: string; organizationId: string },
  roleIds: readonly string[],
): Promise<void> {
  await executor
    .delete(membershipRoles)
    .where(
      and(
        eq(membershipRoles.membershipId, membership.id),
        notInArray(membershipRoles.roleId, [...roleIds]),
      ),
    );
  await executor
    .insert(membershipRoles)
    .values(
      roleIds.map((roleId) => ({
        organizationId: membership.organizationId,
        membershipId: membership.id,
        roleId,
      })),
    )
    .onConflictDoNothing();
}

/** A new invitation's roles, refused across organizations as giveRoles' are. */
export async function nameRoles(
  executor: Executor,
  invitation: { id: string; organizationId: string },
  roleIds: readonly string[],
): Promise<void> {
  await executor.insert(invitationRoles).values(
    roleIds.map((roleId) => ({
      organizationId: invitation.organizationId,
      invitationId: invitation.id,
      roleId,
    })),
  );
}

/**
 * Everything a membership's roles grant together: what the member may do
 * (ADR-080). One indexed query from the membership through its roles to
 * their permissions, on whichever handle the caller holds, so a check made
 * under a lock reads inside it.
 */
export async function grantsOfMember(
  executor: Executor,
  membershipId: string,
): Promise<Permission[]> {
  const rows = await executor
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
 * What each role grants, by role id, every id present: the ids come from
 * a query already scoped to the organization, as rolesOfMembers' do.
 */
export async function grantsOf(
  executor: Executor,
  roleIds: readonly string[],
): Promise<Map<string, Permission[]>> {
  const granted = new Map<string, Permission[]>(
    roleIds.map((roleId) => [roleId, []]),
  );
  if (roleIds.length === 0) return granted;

  const rows = await executor
    .select({ roleId: rolePermissions.roleId, key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(permissions.id, rolePermissions.permissionId))
    .where(inArray(rolePermissions.roleId, [...roleIds]));
  for (const { roleId, key } of rows) {
    granted.get(roleId)?.push(key as Permission);
  }
  return granted;
}

const ROLE = {
  id: roles.id,
  name: roles.name,
  description: roles.description,
  isSystem: roles.isSystem,
};

async function grouped(
  query: Promise<({ of: string } & HeldRole)[]>,
): Promise<Map<string, HeldRole[]>> {
  const held = new Map<string, HeldRole[]>();
  for (const { of, ...role } of await query) {
    held.set(of, [...(held.get(of) ?? []), role]);
  }
  return held;
}
