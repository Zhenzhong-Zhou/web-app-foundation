import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { getRequestContext } from '../auth/request-context';
import type { Permission } from './permissions';
import { PermissionsService } from './permissions.service';
import { REQUIRED_PERMISSIONS } from './require-permissions.decorator';

/**
 * Checks the current membership's role against the permissions a route
 * declares (ADR-004).
 *
 * Resolved per request, never cached on the session or the request context. A
 * demoted admin must lose access on their next request, not at session expiry
 * — which is the failure ADR-011's binding rules call out by name.
 *
 * The cost is one indexed join over two small tables (nine permissions, three
 * roles per organization), which Postgres keeps in shared buffers. If it ever
 * shows up in a latency profile, the cache goes on `role_id -> Set<key>` with
 * a short TTL: roles are configuration and change rarely, whereas *which* role
 * a user holds is the thing that changes on demotion — and that lookup stays
 * per request regardless. Caching by user or by session is the unsafe version.
 * In-memory would break across instances the same way the throttler does, so
 * it lands with Redis (ADR-005) or not at all.
 *
 * Uses the unscoped handle: `permissions` has no organization_id (it is a
 * fixed catalogue, which is also why reset-db preserves it), and
 * role_permissions is reached through a role id the membership already proved
 * belongs to this organization. This is the second of two exemptions to the
 * ADR-003 rule, alongside core/auth.
 */
@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissions: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<Permission[]>(
      REQUIRED_PERMISSIONS,
      [context.getHandler(), context.getClass()],
    );

    // No decorator means no permission requirement. Authentication is already
    // mandatory by default via SessionGuard, so an undecorated route is
    // "any member of the organization", not "anyone".
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const requestContext = getRequestContext(req);

    // SessionGuard runs first and rejects both of these, so reaching here
    // means a route was decorated with @RequirePermissions() and @Public()
    // together — a contradiction worth failing on rather than ignoring.
    if (!requestContext?.roleId) {
      throw new ForbiddenException('No role in the current organization');
    }

    const held = new Set(
      await this.permissions.listForRole(requestContext.roleId),
    );
    const missing = required.filter((key) => !held.has(key));

    if (missing.length > 0) {
      // Names the missing permission. The caller is already authenticated, so
      // telling them which grant they lack is useful rather than a disclosure —
      // they can ask an admin for it by name instead of filing "it says 403".
      throw new ForbiddenException(`Missing permission: ${missing.join(', ')}`);
    }

    return true;
  }
}
