import { and, asc, eq, inArray, notInArray } from 'drizzle-orm';

import type { Database, Transaction } from '../../database/database.module';
import { invitationRoles, membershipRoles, roles } from '../../database/schema';

type Executor = Database | Transaction;

/** A role as a member holds it or an invitation names it (ADR-080). */
export interface HeldRole {
  id: string;
  name: string;
  /** A made role's line; null for a built-in role, worded by its key. */
  description: string | null;
  isSystem: boolean;
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
