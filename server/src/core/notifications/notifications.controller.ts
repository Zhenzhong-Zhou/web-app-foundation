import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../auth/current-user.decorator';
import type { RequestContext } from '../auth/request-context';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsService } from './notifications.service';

/**
 * The bell (ADR-036).
 *
 * No @RequirePermissions anywhere in this controller, which is deliberate and
 * the only place in the API it is true. A notification is addressed to a
 * person, so the session's userId is the whole of the authorization — a
 * permission would ask whether somebody may read a category of thing, which is
 * the wrong question. Every method below passes that id to the service, and
 * every query there filters on it.
 *
 * Not audited either. Reading your own notification is not an act on the
 * organization, and a row per bell-open in a table kept for 24 months is the
 * trade ADR-012 declines. The two writes are on the coverage test's
 * allow-list with that reason.
 */
@Controller({ path: 'notifications', version: '1' })
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService) {}

  /**
   * Declared before any future @Get(':id'): Nest matches in declaration order,
   * and 'unread-count' would otherwise be read as an id — the same trap the
   * products controller documents for 'variants'.
   *
   * Its own endpoint rather than a field on the list, because the badge is
   * wanted on every page and the list is wanted when the bell is opened.
   * Folding them would fetch twenty rows to render a number.
   */
  @Get('unread-count')
  async unreadCount(@CurrentUser() user: RequestContext) {
    return { count: await this.notifications.unreadCount(user.userId) };
  }

  @Get()
  list(
    @CurrentUser() user: RequestContext,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notifications.list(user.userId, query.before, query.limit);
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markRead(
    @CurrentUser() user: RequestContext,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    await this.notifications.markRead(user.userId, id);
  }

  /**
   * One request rather than one per row: the bell's usual gesture is
   * dismissing everything, and twenty requests to do it is twenty chances for
   * one to fail halfway.
   */
  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  async markAllRead(@CurrentUser() user: RequestContext): Promise<void> {
    await this.notifications.markAllRead(user.userId);
  }
}
