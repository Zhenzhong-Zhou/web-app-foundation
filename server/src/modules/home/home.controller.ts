import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';

import { AUDIT_ACTIONS } from '../../core/audit/audit-actions';
import { recordContext } from '../../core/audit/audit-context';
import { Audited } from '../../core/audit/audited.decorator';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import type { RequestContext } from '../../core/auth/request-context';
import { getRequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { RequirePermissions } from '../../core/authorization/require-permissions.decorator';
import type { HomeResponse } from './dto/home-response.dto';
import { HomeService } from './home.service';
import { WelcomeService } from './welcome.service';

/**
 * Home (ADR-058). No permission on the route: each card is gated by its
 * own view permission inside, as the lookup's kinds are (ADR-056).
 */
@Controller({ path: 'home', version: '1' })
export class HomeController {
  constructor(
    private readonly home: HomeService,
    private readonly permissions: PermissionsService,
    private readonly welcome: WelcomeService,
  ) {}

  @Get()
  async get(@CurrentUser() user: RequestContext): Promise<HomeResponse> {
    const held = new Set(
      user.roleId ? await this.permissions.listForRole(user.roleId) : [],
    );
    return this.home.home(user, held);
  }

  /**
   * The welcome's Dismiss, and its Undo (ADR-079): the person's own, on
   * their membership alone, so no permission; and not audited, since it
   * changes only what they see, as a recently opened record does.
   */
  @Post('welcome/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async dismissWelcome(@CurrentUser() user: RequestContext): Promise<void> {
    await this.welcome.setDismissed(user.userId, true);
  }

  @Delete('welcome/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  async showWelcome(@CurrentUser() user: RequestContext): Promise<void> {
    await this.welcome.setDismissed(user.userId, false);
  }

  /**
   * Getting started's two controls (ADR-058), the organization's settings:
   * only a member who may change those, and each change logged as one.
   */
  @Post('getting-started/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  async dismiss(): Promise<void> {
    recordContext({ gettingStarted: 'dismissed' });
    await this.home.setGettingStartedDismissed(true);
  }

  @Delete('getting-started/dismiss')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  async show(): Promise<void> {
    recordContext({ gettingStarted: 'shown' });
    await this.home.setGettingStartedDismissed(false);
  }

  @Post('getting-started/skip-team')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermissions(PERMISSIONS.ORGANIZATIONS_UPDATE)
  @Audited({
    action: AUDIT_ACTIONS.ORGANIZATION_UPDATED,
    resourceType: 'organization',
    resourceId: (_response, request) =>
      getRequestContext(request)?.organizationId ?? undefined,
  })
  async skipTeam(): Promise<void> {
    recordContext({ gettingStarted: 'team step skipped' });
    await this.home.skipTeamStep();
  }
}
