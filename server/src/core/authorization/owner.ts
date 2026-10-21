import { type SQL, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';

import { membershipRoles, roles } from '../../database/schema';
import { SYSTEM_ROLES } from './permissions';

/**
 * Whether a member is an Owner (ADR-080): the one question about access a
 * role's name may answer, and only together with is_system, so a role an
 * organization made can never pass for the built-in one. Every check of
 * Owner goes through here, in one of two forms of the same rule.
 *
 * For a role in hand: whether it is the built-in Owner.
 */
export function isOwnerRole(role: { name: string; isSystem: boolean }) {
  return role.isSystem && role.name === SYSTEM_ROLES.OWNER;
}

/**
 * For a query: whether the membership whose id is `membershipId` holds the
 * Owner role, as a condition to select, filter or count on. Its own
 * aliases inside, so the column given, the outer query's, is the only one
 * of its name in reach.
 */
export function holdsOwner(membershipId: AnyPgColumn | SQL): SQL<boolean> {
  return sql<boolean>`exists (
    select 1 from ${membershipRoles} owner_held
    join ${roles} owner_role on owner_role.id = owner_held.role_id
    where owner_held.membership_id = ${membershipId}
      and owner_role.is_system
      and owner_role.name = ${SYSTEM_ROLES.OWNER}
  )`;
}
