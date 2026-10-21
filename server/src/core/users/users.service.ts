import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { isUniqueViolation } from '../../database/errors';
import { memberships, roles, users } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t, type Translatable } from '../../i18n/translate';
import { recordPrevious } from '../audit/audit-context';
import { PasswordService } from '../auth/password.service';
import { RequestContext } from '../auth/request-context';
import type { RoleRef } from '../authorization/dto/role-response.dto';
import {
  beyond,
  cannotGive,
  countOwners,
  giverHolds,
  type GrantingRole,
  grantingRoles,
  includesOwner,
  lockOwners,
  rolesToGive,
} from '../authorization/giving';
import {
  giveRoles,
  roleRef,
  rolesOfMembers,
  setRoles,
} from '../authorization/member-roles';
import type { Permission } from '../authorization/permissions';
import type { CreateUserDto } from './dto/create-user.dto';

export interface OrganizationMember {
  id: string;
  email: string;
  name: string;
  roles: RoleRef[];
  /** Their photo (ADR-063); null shows their initials. */
  photoFileId?: string | null;
  lastActiveAt?: Date | null;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly tenantDb: TenantDb,
    // The global handle is confined to create(): a user must be looked up and
    // inserted before any membership makes them reachable through TenantDb.
    // The lint rule does not cover core/users, so this import is a deliberate
    // exception — see the comment in create().
    private readonly passwords: PasswordService,
  ) {}

  /**
   * users has no organization_id (ADR-004), so membership is what scopes this.
   * The join is driven from the scoped side, which is what keeps the filter
   * inside TenantDb rather than in this method.
   */
  async listMembers(): Promise<OrganizationMember[]> {
    const rows = await this.tenantDb.selectJoined(
      memberships,
      users,
      eq(users.id, memberships.userId),
      {
        membershipId: memberships.id,
        id: users.id,
        email: users.email,
        name: users.name,
        // Their face beside their name (ADR-063).
        photoFileId: users.photoFileId,
        // Shown coarse, or exact with audit.view (ADR-063), by the route.
        lastActiveAt: memberships.lastActiveAt,
      },
    );
    const held = await this.tenantDb.transaction((tx) =>
      rolesOfMembers(
        tx,
        rows.map((row) => row.membershipId),
      ),
    );

    return rows.map(({ membershipId, ...member }) => ({
      ...member,
      roles: (held.get(membershipId) ?? []).map(roleRef),
    }));
  }

  /**
   * A colleague made with a password someone else knows: the demo seed's
   * alone, whose accounts are meant to be signed into. No route makes one;
   * a person joins by invitation and chooses their own (ADR-077).
   */
  async create(input: CreateUserDto): Promise<OrganizationMember> {
    // Scoped, so a roleId belonging to another organization simply is not
    // found — an admin cannot attach their member to a foreign role.
    const [role] = await this.tenantDb.select(
      roles,
      eq(roles.id, input.roleId),
    );

    if (!role) {
      throw new BadRequestException(
        t({ id: 'users.unknownRole', defaultMessage: 'Unknown role' }),
      );
    }

    const passwordHash = await this.passwords.hash(input.password);

    try {
      return await this.tenantDb.transaction(async (tx, organizationId) => {
        const [existing] = await tx
          .select({ id: users.id })
          .from(users)
          .where(eq(sql`lower(${users.email})`, input.email));

        // An existing user joining a second organization is legitimate under
        // ADR-004 and needs a different flow — it must not silently reset
        // their password or overwrite their name. Deferred with invitations.
        if (existing) {
          throw new ConflictException(
            t({
              id: 'users.emailTaken',
              defaultMessage:
                'That email address already belongs to an account',
            }),
          );
        }

        const [created] = await tx
          .insert(users)
          .values({ email: input.email, name: input.name, passwordHash })
          .returning({
            id: users.id,
            email: users.email,
            name: users.name,
          });

        const [membership] = await tx
          .insert(memberships)
          .values({ userId: created.id, organizationId })
          .returning({ id: memberships.id });
        await giveRoles(tx, { id: membership.id, organizationId }, [role.id]);

        return { ...created, roles: [roleRef(role)] };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          t({
            id: 'users.emailTaken',
            defaultMessage: 'That email address already belongs to an account',
          }),
        );
      }
      throw error;
    }
  }

  /**
   * Makes a member's roles exactly these (ADR-080), within the caller's
   * organization: one or more, Owner alone, and only what the caller may
   * give, to a member the caller may change.
   *
   * Every check is made under the organization's lock on its Owners and
   * on the same transaction as the change, so two Owners demoting each
   * other at once cannot leave none, and a caller demoted a moment before
   * is read as demoted. Permission strings say what a caller may *do*,
   * not what they may do *to whom* (ADR-016's gap), so this lives here
   * rather than in the guard.
   */
  async updateRoles(
    context: RequestContext,
    userId: string,
    roleIds: readonly string[],
  ): Promise<void> {
    const name = await this.tenantDb.transaction(async (tx, organizationId) => {
      await lockOwners(tx, organizationId);

      const target = await rolesToGive(tx, organizationId, roleIds);

      const { membership, current, held } = await this.loadMember(
        tx,
        organizationId,
        context,
        userId,
      );

      // Giving, then changing, as ADR-016's two Owner rules always ran.
      const added = target.filter(
        (role) => !current.some((kept) => kept.id === role.id),
      );
      const addedBeyond = beyond(held, added);
      if (includesOwner(addedBeyond)) {
        throw new ForbiddenException(
          t({
            id: 'users.ownerAssign',
            defaultMessage: 'Only an Owner can assign the Owner role',
          }),
        );
      }
      if (addedBeyond.length > 0) {
        throw new ForbiddenException(cannotGive(addedBeyond));
      }
      this.assertMayChange(held, current, membership.name, {
        owner: t({
          id: 'users.ownerChange',
          defaultMessage: "Only an Owner can change an Owner's role",
        }),
        beyond: (member) =>
          t(
            {
              id: 'users.cannotChange',
              defaultMessage:
                'Your roles don’t include everything {name}’s roles can do, so you can’t change their roles.',
            },
            { name: member },
          ),
      });

      // Never from the last Owner, which binds an Owner too (ADR-012): an
      // organization with no Owner has nobody who can appoint one.
      if (
        includesOwner(current) &&
        !includesOwner(target) &&
        (await countOwners(tx, organizationId)) <= 1
      ) {
        throw new ConflictException(
          t({
            id: 'users.lastOwnerChange',
            defaultMessage: 'Transfer ownership before changing this role',
          }),
        );
      }

      await setRoles(tx, { id: membership.id, organizationId }, roleIds);

      // As the body has them when nothing changed, so the save writes no
      // entry; otherwise as they were.
      const same =
        current.length === target.length &&
        target.every((role) => current.some((kept) => kept.id === role.id));
      recordPrevious({
        roleIds: same ? [...roleIds] : current.map((role) => role.id),
      });
      return membership.name;
    });

    this.logger.log(`Roles of ${userId} (${name}) changed`);
  }

  /**
   * Removes a membership. The user's account, sessions, and audit trail all
   * survive — this revokes access to one organization, nothing more.
   *
   * Their live session is not revoked, deliberately. SessionContextMiddleware
   * resolves membership per request (ADR-016), so organizationId becomes null
   * on their next call and every org-scoped route 403s. Account routes keep
   * working, which is correct: they still have an account, they just have no
   * organization.
   */
  async removeMember(context: RequestContext, userId: string): Promise<void> {
    // Leaving an organization is the user's own action, with its own
    // consequences — it is not an admin removing someone, and it should not
    // be reachable by accident from a member list.
    if (userId === context.userId) {
      throw new BadRequestException(
        t({
          id: 'users.removeSelf',
          defaultMessage: 'You cannot remove yourself from the organization',
        }),
      );
    }

    await this.tenantDb.transaction(async (tx, organizationId) => {
      await lockOwners(tx, organizationId);
      const { membership, current, held } = await this.loadMember(
        tx,
        organizationId,
        context,
        userId,
      );

      this.assertMayChange(held, current, membership.name, {
        owner: t({
          id: 'users.ownerRemove',
          defaultMessage: 'Only an Owner can remove an Owner',
        }),
        beyond: (member) =>
          t(
            {
              id: 'users.cannotRemove',
              defaultMessage:
                'Your roles don’t include everything {name}’s roles can do, so you can’t remove them.',
            },
            { name: member },
          ),
      });
      if (
        includesOwner(current) &&
        (await countOwners(tx, organizationId)) <= 1
      ) {
        throw new ConflictException(
          t({
            id: 'users.lastOwnerRemove',
            defaultMessage: 'Transfer ownership before removing this member',
          }),
        );
      }

      await tx
        .delete(memberships)
        .where(
          and(
            eq(memberships.id, membership.id),
            eq(memberships.organizationId, organizationId),
          ),
        );
    });

    this.logger.log(`Membership of ${userId} removed`);
  }

  /**
   * A member of the caller's organization, by name, with the roles they
   * hold and what each grants, and what the caller holds, read on the
   * transaction the change is made in. A member of another organization
   * is simply not found.
   */
  private async loadMember(
    tx: Transaction,
    organizationId: string,
    context: RequestContext,
    userId: string,
  ) {
    const [membership] = await tx
      .select({ id: memberships.id, name: users.name })
      .from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId))
      .where(
        and(
          eq(memberships.organizationId, organizationId),
          eq(memberships.userId, userId),
        ),
      );
    if (!membership) {
      throw new NotFoundException(
        t({ id: 'users.notFound', defaultMessage: 'No such member' }),
      );
    }

    const heldIds = (
      (await rolesOfMembers(tx, [membership.id])).get(membership.id) ?? []
    ).map((role) => role.id);
    return {
      membership,
      current: (await grantingRoles(tx, organizationId, heldIds)) ?? [],
      held: await giverHolds(tx, context.membershipId!),
    };
  }

  /**
   * Changing or removing a member needs the caller's roles to hold
   * everything the member's roles grant (ADR-080). An Owner holds
   * everything, so only an Owner acts on an Owner, refused in ADR-016's
   * own words.
   */
  private assertMayChange(
    held: ReadonlySet<Permission>,
    current: GrantingRole[],
    name: string,
    refusals: { owner: Translatable; beyond: (name: string) => Translatable },
  ): void {
    if (beyond(held, current).length === 0) return;
    throw new ForbiddenException(
      includesOwner(current) ? refusals.owner : refusals.beyond(name),
    );
  }
}
