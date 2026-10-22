import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { localeOf } from '../../i18n/translate';
import { AuditService } from '../audit/audit.service';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { CreateRoleDto, MoveRoleDto, UpdateRoleDto } from './dto/role.dto';
import type { Role, RoleCatalogue, RoleDetail } from './dto/role-response.dto';
import { PERMISSIONS } from './permissions';
import { PermissionsService } from './permissions.service';
import { RequirePermissions } from './require-permissions.decorator';
import { type RoleReader, RolesService } from './roles.service';

/**
 * The organization's roles (ADR-080). Every member reads them, as everyone
 * reads People: the role names Members shows beside each member, a role's
 * page, and the editor's catalogue. Making, changing and deleting are the
 * Owners', by three permissions never offered in the editor; Move
 * everyone is changing members' roles, roles.assign's, under the rule
 * that only what you hold can be given.
 *
 * Every write returns the role's page as its read does (CLAUDE.md), and
 * delete nothing.
 */
@Controller({ path: 'roles', version: '1' })
export class RolesController {
  private readonly logger = new Logger(RolesController.name);

  constructor(
    private readonly roles: RolesService,
    private readonly permissions: PermissionsService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @RequirePermissions(PERMISSIONS.ROLES_VIEW)
  async list(
    @CurrentUser() user: RequestContext,
    @Headers('accept-language') language?: string,
  ): Promise<Role[]> {
    return this.roles.list(await this.reader(user, language));
  }

  /** Every permission with its line and needs, and the templates. */
  @Get('catalogue')
  @RequirePermissions(PERMISSIONS.ROLES_VIEW)
  catalogue(@Headers('accept-language') language?: string): RoleCatalogue {
    return this.roles.catalogue(localeOf(language));
  }

  @Get(':id')
  @RequirePermissions(PERMISSIONS.ROLES_VIEW)
  async find(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Headers('accept-language') language?: string,
  ): Promise<RoleDetail> {
    return this.roles.detail(id, await this.reader(user, language));
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.ROLES_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.ROLE_CREATED,
    resourceType: 'role',
    resourceId: (response: RoleDetail) => response.id,
    fields: ['name', 'description'],
  })
  async create(
    @CurrentUser() user: RequestContext,
    @Body() dto: CreateRoleDto,
    @Headers('accept-language') language?: string,
  ): Promise<RoleDetail> {
    const id = await this.roles.create(dto, user);
    return this.roles.detail(id, await this.reader(user, language));
  }

  /**
   * The whole role, as the editor saves it, with when it was saved last
   * as the editor read it. Its name and line from and to, and the
   * permissions added and removed, each in words in the log.
   */
  @Patch(':id')
  @RequirePermissions(PERMISSIONS.ROLES_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ROLE_UPDATED,
    resourceType: 'role',
    resourceId: (_response, request) => request.params.id,
    fields: ['name', 'description'],
  })
  async update(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateRoleDto,
    @Headers('accept-language') language?: string,
  ): Promise<RoleDetail> {
    await this.roles.update(id, dto, user);
    return this.roles.detail(id, await this.reader(user, language));
  }

  /** Its name and what it granted stay in the log, which outlives it. */
  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ROLES_DELETE)
  @Audited({
    action: AUDIT_ACTIONS.ROLE_DELETED,
    resourceType: 'role',
    resourceId: (_response, request) => request.params.id,
  })
  async remove(@Param('id', ParseUUIDPipe) id: string): Promise<void> {
    await this.roles.remove(id);
  }

  /**
   * Move everyone to another role. Audited here, one entry for each
   * member moved, so each person's history says what happened to them
   * (ADR-080); a decorator writes one.
   */
  @Post(':id/move')
  @HttpCode(HttpStatus.OK)
  @RequirePermissions(PERMISSIONS.ROLES_ASSIGN)
  async move(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: MoveRoleDto,
    @Headers('accept-language') language?: string,
  ): Promise<RoleDetail> {
    const moved = await this.roles.move(id, dto.toRoleId, user);
    for (const member of moved) {
      // As the interceptor writes one: the move has happened, so a failed
      // entry is logged rather than reported as a failed move.
      try {
        await this.audit.record({
          actorId: user.userId,
          action: AUDIT_ACTIONS.MEMBER_ROLES_CHANGED,
          resourceType: 'user',
          resourceId: member.userId,
          payload: { roleIds: { from: member.from, to: member.to } },
          ip: user.ip,
          userAgent: user.userAgent,
        });
      } catch (error) {
        this.logger.error(`Audit write failed: ${String(error)}`);
      }
    }
    return this.roles.detail(id, await this.reader(user, language));
  }

  private async reader(
    user: RequestContext,
    language: string | undefined,
  ): Promise<RoleReader> {
    return {
      held: await this.permissions.heldBy(user.membershipId),
      locale: localeOf(language),
    };
  }
}
