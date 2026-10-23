import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { and, eq, inArray, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { memberships, roles } from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';
import {
  grantsOf,
  grantsOfMember,
  type HeldRole,
  rolesOfMembers,
} from './member-roles';
import { holdsOwner, isOwnerRole } from './owner';
import type { Permission } from './permissions';
import { roleName } from './role-words';

/** A role with what it grants, as the rule below weighs it. */
export interface GrantingRole extends HeldRole {
  permissions: Permission[];
}

/**
 * Giving only what you hold (ADR-080): to give a role, by changing a
 * member's roles, inviting or Move everyone, the giver's roles must
 * together hold everything it grants; to change or remove a member, also
 * everything the member's roles grant. ADR-016's role hierarchy, which
 * covers its Owner rules: an Owner holds everything, so only an Owner
 * gives Owner or acts on one, and those refusals keep their own words.
 *
 * Here are the reads the rule needs, made on the transaction a change is
 * made in, so a giver demoted a moment before is read as demoted.
 */

/** What the giver's roles hold together. */
export async function giverHolds(
  tx: Transaction,
  membershipId: string,
): Promise<ReadonlySet<Permission>> {
  return new Set(await grantsOfMember(tx, membershipId));
}

/** ADR-016's Owner refusals, which keep their words (ADR-080). */
export const ONLY_AN_OWNER_GIVES_OWNER = t({
  id: 'users.ownerAssign',
  defaultMessage: 'Only an Owner can assign the Owner role',
});
export const ONLY_AN_OWNER_CHANGES_AN_OWNER = t({
  id: 'users.ownerChange',
  defaultMessage: 'Only an Owner can change an Owner’s role',
});
export const LAST_OWNER_CHANGE = t({
  id: 'users.lastOwnerChange',
  defaultMessage: 'Transfer ownership before changing this role',
});

/**
 * These roles of the organization's, with what each grants, in the order
 * asked. An id it has none of is malformed, as a body naming another
 * organization's record is (400).
 */
export async function grantingRoles(
  tx: Transaction,
  organizationId: string,
  roleIds: readonly string[],
): Promise<GrantingRole[]> {
  if (roleIds.length === 0) return [];
  const found = await tx
    .select({
      id: roles.id,
      name: roles.name,
      description: roles.description,
      isSystem: roles.isSystem,
    })
    .from(roles)
    .where(
      and(
        eq(roles.organizationId, organizationId),
        inArray(roles.id, [...roleIds]),
      ),
    );
  if (found.length !== new Set(roleIds).size) {
    throw new BadRequestException(
      t({ id: 'users.unknownRole', defaultMessage: 'Unknown role' }),
    );
  }

  const granted = await grantsOf(
    tx,
    found.map((role) => role.id),
  );
  const byId = new Map(found.map((role) => [role.id, role]));
  return roleIds.map((id) => ({
    ...byId.get(id)!,
    permissions: granted.get(id) ?? [],
  }));
}

/**
 * Each member's roles, with what each grants, read in two queries however
 * many members there are: the roles, then the grants of all of them.
 */
export async function grantingRolesOfMembers(
  tx: Transaction,
  membershipIds: readonly string[],
): Promise<Map<string, GrantingRole[]>> {
  const held = await rolesOfMembers(tx, membershipIds);
  const granted = await grantsOf(tx, [
    ...new Set([...held.values()].flat().map((role) => role.id)),
  ]);
  return new Map(
    [...held].map(([membershipId, roles]) => [
      membershipId,
      roles.map((role) => ({
        ...role,
        permissions: granted.get(role.id) ?? [],
      })),
    ]),
  );
}

/**
 * The roles a member is to hold, or an invitation to name (ADR-080): each
 * this organization's, and Owner alone, since it already holds
 * everything. Malformed otherwise (400).
 */
export async function rolesToGive(
  tx: Transaction,
  organizationId: string,
  roleIds: readonly string[],
): Promise<GrantingRole[]> {
  const given = await grantingRoles(tx, organizationId, roleIds);
  if (includesOwner(given) && given.length > 1) {
    throw new BadRequestException(
      t({
        id: 'roles.ownerAlone',
        defaultMessage:
          'An Owner holds no other role: Owner already includes everything.',
      }),
    );
  }
  return given;
}

/**
 * Refuses to give roles beyond what the giver holds: Owner in ADR-016's
 * words, any other by name (cannotGive), unless the caller words it.
 */
export function refuseBeyond(
  held: ReadonlySet<Permission>,
  given: readonly GrantingRole[],
  refusals: {
    owner: Translatable;
    beyond: (roles: readonly GrantingRole[]) => Translatable;
  } = { owner: ONLY_AN_OWNER_GIVES_OWNER, beyond: cannotGive },
): void {
  const outside = beyond(held, given);
  if (includesOwner(outside)) throw new ForbiddenException(refusals.owner);
  if (outside.length > 0) {
    throw new ForbiddenException(refusals.beyond(outside));
  }
}

/** The roles among these that grant something the giver does not hold. */
export function beyond(
  held: ReadonlySet<Permission>,
  given: readonly GrantingRole[],
): GrantingRole[] {
  return given.filter((role) => role.permissions.some((key) => !held.has(key)));
}

/** Whether any of these is the built-in Owner. */
export function includesOwner(
  given: readonly { name: string; isSystem: boolean }[],
) {
  return given.some(isOwnerRole);
}

/**
 * The organization's lock on who is Owner, held to the end of the
 * transaction: every change that could take Owner from someone counts the
 * Owners under it, leaving and deleting an account too, so two Owners
 * demoting, removing or leaving at once cannot leave none (ADR-080), as
 * counting without it could.
 */
export async function lockOwners(
  tx: Transaction,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`owners:${organizationId}`}, 0))`,
  );
}

/** How many members hold Owner, read under lockOwners. */
export async function countOwners(
  tx: Transaction,
  organizationId: string,
): Promise<number> {
  const [row] = await tx
    .select({ count: sql<number>`count(*)::int` })
    .from(memberships)
    .where(
      and(
        eq(memberships.organizationId, organizationId),
        holdsOwner(memberships.id),
      ),
    );
  return row?.count ?? 0;
}

/**
 * The refusal for roles beyond the giver, by name: "Your roles don't
 * include everything Warehouse lead can do, so you can't give it."
 */
export function cannotGive(given: readonly GrantingRole[]): Translatable {
  return t(
    {
      id: 'roles.cannotGive',
      defaultMessage:
        'Your roles don’t include everything {roles} can do, so you can’t give {count, plural, one {it} other {them}}.',
    },
    { roles: given.map(roleName), count: given.length },
  );
}
