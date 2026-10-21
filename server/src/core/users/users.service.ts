import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { isUniqueViolation } from '../../database/errors';
import { memberships, roles, users } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t, type Translatable } from '../../i18n/translate';
import { recordPrevious } from '../audit/audit-context';
import { PasswordService } from '../auth/password.service';
import { RequestContext } from '../auth/request-context';
import {
  giveRoles,
  rolesOfMembers,
  setRoles,
} from '../authorization/member-roles';
import { holdsOwner, isOwnerRole } from '../authorization/owner';
import type { CreateUserDto } from './dto/create-user.dto';

export interface OrganizationMember {
  id: string;
  email: string;
  name: string;
  roleId: string;
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

    return rows.map(({ membershipId, ...member }) => {
      const [role] = held.get(membershipId) ?? [];
      return { ...member, roleId: role.id };
    });
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

        return { ...created, roleId: role.id };
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
   * Changes a member's role within the caller's organization.
   *
   * Both checks below live here rather than in a guard because permission
   * strings say what a caller may *do*, not what they may do *to whom*
   * (ADR-016's known gap). No permission string can express "not above your
   * own level".
   */
  async updateRole(
    context: RequestContext,
    userId: string,
    roleId: string,
  ): Promise<void> {
    // Scoped, so a role belonging to another organization simply is not found
    // — the same property create() relies on.
    const [role] = await this.tenantDb.select(roles, eq(roles.id, roleId));
    if (!role)
      throw new NotFoundException(
        t({ id: 'users.unknownRole', defaultMessage: 'Unknown role' }),
      );

    const { membership, held, callerIsOwner } = await this.loadMember(
      context,
      userId,
    );

    // ADR-016's gap, closed here. An Admin promoting someone to Owner would
    // be granting authority the Admin does not hold.
    if (isOwnerRole(role) && !callerIsOwner) {
      throw new ForbiddenException(
        t({
          id: 'users.ownerAssign',
          defaultMessage: 'Only an Owner can assign the Owner role',
        }),
      );
    }

    // Owner to Owner takes nothing away; an Admin trying it was refused
    // just above.
    if (!isOwnerRole(role)) {
      await this.assertMayTakeOwner(callerIsOwner, held, {
        notOwner: t({
          id: 'users.ownerChange',
          defaultMessage: "Only an Owner can change an Owner's role",
        }),
        lastOwner: t({
          id: 'users.lastOwnerChange',
          defaultMessage: 'Transfer ownership before changing this role',
        }),
      });
    }

    await this.tenantDb.transaction((tx, organizationId) =>
      setRoles(tx, { id: membership.id, organizationId }, [roleId]),
    );

    recordPrevious({ roleId: held[0]?.id });

    this.logger.log(`Role of ${userId} changed to ${role.name}`);
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

    const { membership, held, callerIsOwner } = await this.loadMember(
      context,
      userId,
    );

    await this.assertMayTakeOwner(callerIsOwner, held, {
      notOwner: t({
        id: 'users.ownerRemove',
        defaultMessage: 'Only an Owner can remove an Owner',
      }),
      lastOwner: t({
        id: 'users.lastOwnerRemove',
        defaultMessage: 'Transfer ownership before removing this member',
      }),
    });

    await this.tenantDb.delete(memberships, eq(memberships.id, membership.id));

    this.logger.log(`Membership of ${userId} removed`);
  }

  /**
   * A member of the caller's organization, with the roles they hold, and
   * whether the caller is an Owner. Scoped, so a member of another
   * organization is simply not found.
   */
  private async loadMember(context: RequestContext, userId: string) {
    const [membership] = await this.tenantDb.select(
      memberships,
      eq(memberships.userId, userId),
    );

    if (!membership)
      throw new NotFoundException(
        t({ id: 'users.notFound', defaultMessage: 'No such member' }),
      );

    const heldBy = await this.tenantDb.transaction((tx) =>
      rolesOfMembers(tx, [membership.id, context.membershipId!]),
    );

    return {
      membership,
      held: heldBy.get(membership.id) ?? [],
      callerIsOwner: (heldBy.get(context.membershipId!) ?? []).some(
        isOwnerRole,
      ),
    };
  }

  /**
   * Taking Owner away from a member, by changing their role or by removing
   * them. Two rules, in this order:
   *
   * - Only an Owner may. Taking Owner away is as much a privilege change as
   *   granting it (ADR-016's gap). Without this an Admin could strip an
   *   Owner whenever a second one exists — a gap a single-Owner
   *   organization never shows, because the rule below refuses there.
   * - Never from the last Owner, and that binds an Owner too (ADR-012): an
   *   organization with no Owner has nobody who can appoint one.
   */
  private async assertMayTakeOwner(
    callerIsOwner: boolean,
    held: { name: string; isSystem: boolean }[],
    refusals: { notOwner: Translatable; lastOwner: Translatable },
  ): Promise<void> {
    if (!held.some(isOwnerRole)) return;

    if (!callerIsOwner) {
      throw new ForbiddenException(refusals.notOwner);
    }

    const owners = await this.tenantDb.select(
      memberships,
      holdsOwner(memberships.id),
    );

    if (owners.length <= 1) throw new ConflictException(refusals.lastOwner);
  }
}
