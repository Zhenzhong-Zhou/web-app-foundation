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
import { recordPrevious } from '../audit/audit-context';
import { PasswordService } from '../auth/password.service';
import { RequestContext } from '../auth/request-context';
import { SYSTEM_ROLES } from '../authorization/permissions';
import type { CreateUserDto } from './dto/create-user.dto';

export interface OrganizationMember {
  id: string;
  email: string;
  name: string;
  roleId: string;
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
  listMembers(): Promise<OrganizationMember[]> {
    return this.tenantDb.selectJoined(
      memberships,
      users,
      eq(users.id, memberships.userId),
      {
        id: users.id,
        email: users.email,
        name: users.name,
        roleId: memberships.roleId,
      },
    );
  }

  /**
   * Admin-created membership. ADR-006 defers invitations, so this is how a
   * second person joins an organization in V1.
   */
  async create(input: CreateUserDto): Promise<OrganizationMember> {
    // Scoped, so a roleId belonging to another organization simply is not
    // found — an admin cannot attach their member to a foreign role.
    const [role] = await this.tenantDb.select(
      roles,
      eq(roles.id, input.roleId),
    );

    if (!role) {
      throw new BadRequestException('Unknown role');
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
            'That email address already belongs to an account',
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

        await tx.insert(memberships).values({
          userId: created.id,
          organizationId,
          roleId: role.id,
        });

        return { ...created, roleId: role.id };
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'That email address already belongs to an account',
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
    if (!role) throw new NotFoundException('Unknown role');

    const { membership, callerRole, targetRole } = await this.loadMember(
      context,
      userId,
    );

    // ADR-016's gap, closed here. An Admin promoting someone to Owner would
    // be granting authority the Admin does not hold.
    if (
      role.name === SYSTEM_ROLES.OWNER &&
      callerRole?.name !== SYSTEM_ROLES.OWNER
    ) {
      throw new ForbiddenException('Only an Owner can assign the Owner role');
    }

    // Owner to Owner takes nothing away; an Admin trying it was refused
    // just above.
    if (role.name !== SYSTEM_ROLES.OWNER) {
      await this.assertMayTakeOwner(callerRole, targetRole, membership, {
        notOwner: "Only an Owner can change an Owner's role",
        lastOwner: 'Transfer ownership before changing this role',
      });
    }

    await this.tenantDb.update(
      memberships,
      { roleId },
      eq(memberships.id, membership.id),
    );

    recordPrevious({ roleId: membership.roleId });

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
        'You cannot remove yourself from the organization',
      );
    }

    const { membership, callerRole, targetRole } = await this.loadMember(
      context,
      userId,
    );

    await this.assertMayTakeOwner(callerRole, targetRole, membership, {
      notOwner: 'Only an Owner can remove an Owner',
      lastOwner: 'Transfer ownership before removing this member',
    });

    await this.tenantDb.delete(memberships, eq(memberships.id, membership.id));

    this.logger.log(`Membership of ${userId} removed`);
  }

  /**
   * A member of the caller's organization, with their role and the caller's.
   * Scoped, so a member of another organization is simply not found.
   */
  private async loadMember(context: RequestContext, userId: string) {
    const [membership] = await this.tenantDb.select(
      memberships,
      eq(memberships.userId, userId),
    );

    if (!membership) throw new NotFoundException('No such member');

    const [callerRole] = await this.tenantDb.select(
      roles,
      eq(roles.id, context.roleId!),
    );

    const [targetRole] = await this.tenantDb.select(
      roles,
      eq(roles.id, membership.roleId),
    );

    return { membership, callerRole, targetRole };
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
    callerRole: { name: string } | undefined,
    targetRole: { name: string } | undefined,
    membership: { roleId: string },
    refusals: { notOwner: string; lastOwner: string },
  ): Promise<void> {
    if (targetRole?.name !== SYSTEM_ROLES.OWNER) return;

    if (callerRole?.name !== SYSTEM_ROLES.OWNER) {
      throw new ForbiddenException(refusals.notOwner);
    }

    const owners = await this.tenantDb.select(
      memberships,
      eq(memberships.roleId, membership.roleId),
    );

    if (owners.length <= 1) throw new ConflictException(refusals.lastOwner);
  }
}
