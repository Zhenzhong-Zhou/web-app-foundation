import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { RequestContext } from '../auth/request-context';
import type {
  MemberAccess,
  MemberRole,
} from './dto/member-access-response.dto';
import { type HeldRole, rolesOfMember } from './member-roles';
import { ALL_PERMISSIONS, type Permission } from './permissions';
import { PermissionsService } from './permissions.service';

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
  constructor(
    private readonly tenantDb: TenantDb,
    private readonly permissions: PermissionsService,
  ) {}

  async of(
    context: Pick<RequestContext, 'userId' | 'organizationId' | 'membershipId'>,
    held: ReadonlySet<Permission>,
  ): Promise<MemberAccess> {
    const membershipId = context.membershipId;
    if (!membershipId) throw notWorkingHere();

    const roles = await this.tenantDb.transaction((tx) =>
      rolesOfMember(tx, membershipId),
    );
    if (roles.length === 0) throw notWorkingHere();

    return this.given(context, roles.map(memberRole), held);
  }

  /** The same, for a caller that has read the member's roles already. */
  async given(
    context: Pick<RequestContext, 'userId' | 'organizationId'>,
    roles: MemberRole[],
    held: ReadonlySet<Permission>,
  ): Promise<MemberAccess> {
    const organizationId = context.organizationId;
    if (!organizationId) throw notWorkingHere();

    return {
      roles,
      holdsEverything: ALL_PERMISSIONS.every((key) => held.has(key)),
      whomToAsk: await this.permissions.whomToAsk(
        { userId: context.userId, organizationId },
        held,
      ),
    };
  }
}

/** A role as the welcome and Your access say it. */
export function memberRole(role: HeldRole): MemberRole {
  return { name: role.name, description: role.description };
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
