import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import type { Request } from 'express';

import { getRequestContext } from '../../core/auth/request-context';
import { PERMISSIONS } from '../../core/authorization/permissions';
import { PermissionsService } from '../../core/authorization/permissions.service';
import { t } from '../../i18n/translate';

/**
 * production.override_licence, but only when a release carries an override
 * (ADR-050) — the shape AdjustmentGuard has for stock.adjust.
 *
 * @RequirePermissions cannot express it: release is one route, and which
 * permission applies depends on the body. A separate /release-with-override
 * would be a second path through the one transaction that issues components,
 * which is the thing to avoid.
 *
 * It asks whenever an override is present, before the service knows whether
 * one is needed. So someone without the permission who sends one is refused
 * even for a current licence; the client only sends it to people who hold
 * the permission, when the issue plan says it is needed.
 */
@Injectable()
export class LicenceOverrideGuard implements CanActivate {
  constructor(private readonly permissions: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as { licenceOverride?: unknown } | undefined;

    // Absent or null is no override; production.release, already checked on
    // the route, is all a plain release needs.
    if (body?.licenceOverride == null) return true;

    const ctx = getRequestContext(request);
    if (!ctx?.roleId)
      throw new ForbiddenException(
        t({ id: 'production.role', defaultMessage: 'No role' }),
      );

    // Resolved per request, never cached (ADR-016).
    const held = await this.permissions.listForRole(ctx.roleId);

    if (!held.includes(PERMISSIONS.PRODUCTION_OVERRIDE_LICENCE)) {
      throw new ForbiddenException(
        t({
          id: 'production.releasingUnderLicencePolicy',
          defaultMessage:
            'Releasing under a licence the policy refuses needs production.override_licence',
        }),
      );
    }

    return true;
  }
}
