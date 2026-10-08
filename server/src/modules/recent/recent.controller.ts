import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { t } from '../../i18n/translate';
import { ListRecentDto } from './dto/list-recent.dto';
import { RecordOpenedDto } from './dto/record-opened.dto';
import { RECENT_PERMISSION, RecentService } from './recent.service';

/**
 * Recently opened (ADR-058), the person's own. No permission on the
 * routes: each kind is gated by its own view permission, as the lookup's
 * are (ADR-056), and a person only ever reads or clears their own.
 */
@Controller({ path: 'recent', version: '1' })
export class RecentController {
  constructor(
    private readonly recent: RecentService,
    private readonly permissions: PermissionsService,
  ) {}

  private async held(user: RequestContext) {
    return new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
  }

  @Get()
  async list(
    @CurrentUser() user: RequestContext,
    @Query() query: ListRecentDto,
  ) {
    return {
      recent: await this.recent.list(
        user.userId,
        await this.held(user),
        query.limit ?? 6,
      ),
    };
  }

  /** A record page, once loaded: remember it was opened. */
  @Post()
  @HttpCode(HttpStatus.NO_CONTENT)
  async record(
    @CurrentUser() user: RequestContext,
    @Body() dto: RecordOpenedDto,
  ): Promise<void> {
    if (!(await this.held(user)).has(RECENT_PERMISSION[dto.kind])) {
      throw new ForbiddenException(
        t(
          {
            id: 'auth.missingPermission',
            defaultMessage: 'Missing permission: {permissions}',
          },
          { permissions: RECENT_PERMISSION[dto.kind] },
        ),
      );
    }
    await this.recent.record(user.userId, dto.kind, dto.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: RequestContext): Promise<void> {
    await this.recent.clear(user.userId);
  }
}
