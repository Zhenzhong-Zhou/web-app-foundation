import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { ListRecentDto } from './dto/list-recent.dto';
import type { RecentList } from './dto/recent-response.dto';
import { RecordOpenedDto } from './dto/record-opened.dto';
import {
  kindsVisibleWith,
  RECENT_PERMISSION,
  RecentService,
} from './recent.service';

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

  @Get()
  async list(
    @CurrentUser() user: RequestContext,
    @Query() query: ListRecentDto,
  ): Promise<RecentList> {
    return {
      recent: await this.recent.list(
        user.userId,
        kindsVisibleWith(await this.permissions.heldBy(user.membershipId)),
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
    await this.permissions.demand(user, [RECENT_PERMISSION[dto.kind]]);
    await this.recent.record(user.userId, dto.kind, dto.id);
  }

  @Delete()
  @HttpCode(HttpStatus.NO_CONTENT)
  async clear(@CurrentUser() user: RequestContext): Promise<void> {
    await this.recent.clear(user.userId);
  }
}
