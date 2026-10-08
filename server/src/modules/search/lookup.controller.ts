import { Controller, Get, Headers, Query } from '@nestjs/common';

import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { localeOf } from '../../i18n/translate';
import { LookupQueryDto } from './dto/lookup-query.dto';
import { LookupService } from './lookup.service';

/**
 * The top bar's lookup (ADR-056). No permission on the route: each kind of
 * record is gated by its own view permission inside, so a member sees the
 * kinds their lists would show them and no others.
 */
@Controller({ path: 'lookup', version: '1' })
export class LookupController {
  constructor(
    private readonly lookups: LookupService,
    private readonly permissions: PermissionsService,
  ) {}

  @Get()
  async lookup(
    @CurrentUser() user: RequestContext,
    @Query() query: LookupQueryDto,
    @Headers('accept-language') acceptLanguage?: string,
  ) {
    const held = new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
    return this.lookups.lookup(query.q, held, localeOf(acceptLanguage));
  }
}
