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

/**
 * stock.adjust, but only for the one reason that needs it.
 *
 * @RequirePermissions cannot express this: the route is one endpoint for every
 * kind of movement (ADR-023), and which permission applies depends on the body.
 * Splitting /adjustments out to get a static decorator would put a second write
 * path into the ledger, which is the thing that endpoint exists to avoid.
 *
 * Receiving and shipping record what happened in the world. An adjustment
 * overrides the record itself and is the one movement with no external event
 * behind it — so it is held by fewer people.
 */
@Injectable()
export class AdjustmentGuard implements CanActivate {
  constructor(private readonly permissions: PermissionsService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request>();
    const body = request.body as { reason?: string } | undefined;

    // Every other reason is already covered by stock.move on the route.
    if (body?.reason !== 'adjustment') return true;

    const ctx = getRequestContext(request);
    if (!ctx?.roleId) throw new ForbiddenException('No role');

    // Resolved per request, never cached (ADR-016).
    const held = await this.permissions.listForRole(ctx.roleId);

    if (!held.includes(PERMISSIONS.STOCK_ADJUST)) {
      throw new ForbiddenException('Correcting a count needs stock.adjust');
    }

    return true;
  }
}
