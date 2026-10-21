import { Injectable, NotFoundException } from '@nestjs/common';

import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import type { RequestContext } from '../auth/request-context';
import type {
  MemberAccess,
  MemberRole,
} from './dto/member-access-response.dto';
import { rolesOfMembers } from './member-roles';
import { ALL_PERMISSIONS, type Permission, PERMISSIONS } from './permissions';
import { PermissionsService } from './permissions.service';

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
      rolesOfMembers(tx, [membershipId]),
    );
    const [role] = roles.get(membershipId) ?? [];
    if (!role) throw notWorkingHere();

    return this.given(
      context,
      { name: role.name, description: role.description },
      held,
    );
  }

  /** The same, for a caller that has read the member's role already. */
  async given(
    context: Pick<RequestContext, 'userId' | 'organizationId'>,
    role: MemberRole,
    held: ReadonlySet<Permission>,
  ): Promise<MemberAccess> {
    if (!context.organizationId) throw notWorkingHere();

    // Whoever may change roles, those who joined first first: nobody to
    // ask for someone who may change roles themself.
    const whomToAsk = held.has(PERMISSIONS.ROLES_ASSIGN)
      ? []
      : await this.permissions.holdersOf(
          context.organizationId,
          PERMISSIONS.ROLES_ASSIGN,
          { except: context.userId, limit: WHOM_TO_ASK },
        );

    return {
      role,
      holdsEverything: ALL_PERMISSIONS.every((key) => held.has(key)),
      whomToAsk,
    };
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
