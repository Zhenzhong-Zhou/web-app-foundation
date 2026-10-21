import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { PermissionsService } from '../authorization/permissions.service';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { activeSince } from '../people/people.service';
import { UpdateUserDto } from './dto/update-user.dto';
import type { Member } from './dto/user-response.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly permissions: PermissionsService,
  ) {}

  // Viewer holds users.view, so this is readable by every member. The
  // permission still gates it, because a future role need not.
  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  async list(@CurrentUser() user: RequestContext): Promise<Member[]> {
    // Last active as People shows it (ADR-063): roughly for everyone, the
    // time itself only for those who may read the history.
    const exact = (
      await this.permissions.listForMember(user.membershipId)
    ).includes(PERMISSIONS.AUDIT_VIEW);
    const now = new Date();
    return (await this.users.listMembers()).map(
      ({ lastActiveAt, ...member }) => ({
        ...member,
        active: activeSince(lastActiveAt ?? null, now),
        ...(exact ? { lastActiveAt: lastActiveAt ?? null } : {}),
      }),
    );
  }

  /**
   * A member's roles, made exactly those listed (ADR-080). Audited: a
   * role change is a privilege change, and "who granted this" is exactly
   * the question the log exists to answer (ADR-018).
   *
   * roles.assign: changing which roles a member holds is a privilege
   * change, the permission kept for it (permissions.ts), and the one the
   * welcome names whom to ask by (ADR-079).
   */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN)
  @Audited({
    action: AUDIT_ACTIONS.MEMBER_ROLES_CHANGED,
    resourceType: 'user',
    // 204, so the id comes from the path rather than a response body.
    resourceId: (_response, request) => request.params.id,
    fields: ['roleIds'],
  })
  async update(
    @CurrentUser() context: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<void> {
    await this.users.updateRoles(context, id, dto.roleIds);
  }

  /**
   * Removes the member from this organization. Their account survives — that
   * is the distinction, and it is why this is not called delete.
   */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.USERS_DELETE)
  @Audited({
    action: AUDIT_ACTIONS.MEMBER_REMOVED,
    resourceType: 'user',
    resourceId: (_response, request) => request.params.id,
  })
  async remove(
    @CurrentUser() context: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.users.removeMember(context, id);
  }
}
