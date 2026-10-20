import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, ne } from 'drizzle-orm';

import {
  memberships,
  permissions,
  rolePermissions,
  roles,
  users,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { RequestContext } from '../auth/request-context';
import type { MemberAccess } from './dto/member-access-response.dto';
import { ALL_PERMISSIONS, type Permission, PERMISSIONS } from './permissions';

/** The most names "To do more, ask …" gives (ADR-079). */
const WHOM_TO_ASK = 3;

/**
 * What a member may do here, and whom to ask for more (ADR-079): one
 * answer for the welcome on Home and for Your access on Account.
 *
 * The client words what they may do from the session's permissions; this
 * gives what only the server knows, who else holds what. Never from the
 * role's name, so it holds for a role an organization makes.
 */
@Injectable()
export class MemberAccessService {
  constructor(private readonly tenantDb: TenantDb) {}

  async of(
    context: Pick<RequestContext, 'userId' | 'organizationId'>,
    held: ReadonlySet<Permission>,
  ): Promise<MemberAccess> {
    if (!context.organizationId) throw notWorkingHere();

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [role] = await tx
        .select({
          id: roles.id,
          name: roles.name,
          description: roles.description,
        })
        .from(memberships)
        .innerJoin(roles, eq(roles.id, memberships.roleId))
        .where(
          and(
            eq(memberships.organizationId, organizationId),
            eq(memberships.userId, context.userId),
          ),
        );
      if (!role) throw notWorkingHere();

      // Whoever may change roles, those who joined first first: nobody to
      // ask for someone who may change roles themself.
      const whomToAsk = held.has(PERMISSIONS.ROLES_ASSIGN)
        ? []
        : await tx
            .select({
              id: users.id,
              name: users.name,
              photoFileId: users.photoFileId,
            })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .innerJoin(
              rolePermissions,
              eq(rolePermissions.roleId, memberships.roleId),
            )
            .innerJoin(
              permissions,
              eq(permissions.id, rolePermissions.permissionId),
            )
            .where(
              and(
                eq(memberships.organizationId, organizationId),
                eq(permissions.key, PERMISSIONS.ROLES_ASSIGN),
                ne(memberships.userId, context.userId),
                isNull(users.deletedAt),
              ),
            )
            .orderBy(asc(memberships.createdAt), asc(memberships.id))
            .limit(WHOM_TO_ASK);

      return {
        role,
        holdsEverything: ALL_PERMISSIONS.every((key) => held.has(key)),
        whomToAsk,
      };
    });
  }
}

function notWorkingHere(): NotFoundException {
  return new NotFoundException(
    t({
      id: 'account.access.noOrganization',
      defaultMessage:
        'You are not working in an organization, so there is no access to show.',
    }),
  );
}
