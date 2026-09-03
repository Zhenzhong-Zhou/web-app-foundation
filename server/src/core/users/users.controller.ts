import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../audit/audit-actions';
import { Audited } from '../audit/audited.decorator';
import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { PERMISSIONS } from '../authorization/permissions';
import { RequirePermissions } from '../authorization/require-permissions.decorator';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UsersService } from './users.service';

@Controller({ path: 'users', version: '1' })
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Viewer holds users.view, so this is readable by every member. The
  // permission still gates it, because a future role need not.
  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  list() {
    return this.users.listMembers();
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @RequirePermissions(PERMISSIONS.USERS_CREATE)
  @Audited({
    action: AUDIT_ACTIONS.USER_CREATED,
    resourceType: 'user',
    resourceId: (response: { user: { id: string } }) => response.user.id,
  })
  async create(@Body() dto: CreateUserDto) {
    return { user: await this.users.create(dto) };
  }

  /**
   * Audited: a role change is a privilege change, and "who granted this" is
   * exactly the question the log exists to answer (ADR-018).
   *
   * Returns the member rather than 204 so the interceptor has a resourceId to
   * read — @Audited's resourceId is given the response only.
   */
  @Patch(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.USERS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.USER_ROLE_CHANGED,
    resourceType: 'user',
    // 204, so the id comes from the path rather than a response body.
    resourceId: (_response, request) => request.params.id,
  })
  async update(
    @CurrentUser() context: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateUserDto,
  ): Promise<void> {
    await this.users.updateRole(context, id, dto.roleId);
  }
}
