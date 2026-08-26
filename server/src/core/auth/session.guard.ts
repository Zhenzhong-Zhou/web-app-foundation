import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { ALLOW_NO_ORGANIZATION } from './allow-no-organization.decorator';
import { IS_PUBLIC } from './public.decorator';
import { getRequestContext } from './request-context';

/**
 * Policy only. The middleware has already done the reads — this decides what
 * their absence means for the route.
 *
 * Reads the context off the request rather than out of AsyncLocalStorage, so
 * that the day a bearer transport arrives (ADR-011) only the middleware
 * changes.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const targets = [context.getHandler(), context.getClass()];

    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, targets)) {
      return true;
    }

    const req = context.switchToHttp().getRequest<Request>();
    const requestContext = getRequestContext(req);

    // One message for missing, expired, and revoked. Which one it was is
    // information the caller has not earned.
    if (!requestContext) {
      throw new UnauthorizedException('Authentication required');
    }

    if (
      requestContext.organizationId === null &&
      !this.reflector.getAllAndOverride<boolean>(ALLOW_NO_ORGANIZATION, targets)
    ) {
      // 403, not 401: the credential is valid, the context is not. Retrying
      // with a fresh login would not help, and telling the client to would
      // send it into a loop.
      throw new ForbiddenException('You do not belong to any organization');
    }

    return true;
  }
}
