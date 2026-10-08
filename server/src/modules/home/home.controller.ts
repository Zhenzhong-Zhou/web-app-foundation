import { Controller, Get, Query } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { HomeQueryDto } from './dto/home-query.dto';
import { HomeService } from './home.service';

/**
 * Home (ADR-058). No permission on the route: each card is gated by its
 * own view permission inside, as the lookup's kinds are (ADR-056).
 */
@Controller({ path: 'home', version: '1' })
export class HomeController {
  constructor(
    private readonly home: HomeService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestContext, @Query() query: HomeQueryDto) {
    const held = new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
    return this.home.home(
      held,
      query.today ?? new Date().toISOString().slice(0, 10),
    );
  }
}
