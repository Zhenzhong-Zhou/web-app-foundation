import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';

import { SKIP_CSRF } from './skip-csrf.decorator';

/**
 * Requires a custom header on state-changing requests.
 *
 * A cross-site form cannot set a header at all, and a cross-origin fetch that
 * tries triggers a CORS preflight this server never answers. The header's
 * presence is therefore proof the request came from our own origin — its
 * *value* is irrelevant, so there is no token to generate, store, or rotate.
 *
 * This is the layer under sameSite: 'lax' (ADR-011), which already blocks the
 * common cases. It covers what Lax does not: a compromised subdomain is
 * same-site, older browsers ignore the attribute entirely, and a future
 * sameSite: 'none' for a mobile transport would remove the protection
 * outright.
 */
export const CSRF_HEADER = 'x-requested-with';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();

    // Safe methods must not mutate anything, so there is nothing to forge.
    // Exempting them also keeps <img> and <link> working.
    if (SAFE_METHODS.has(req.method)) return true;

    if (
      this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [
        context.getHandler(),
        context.getClass(),
      ])
    ) {
      return true;
    }

    // An empty value is not a header. A client sending `X-Requested-With:`
    // with nothing after it has proved nothing about its origin.
    const header = req.headers[CSRF_HEADER];

    if (header === undefined || header === '') {
      throw new ForbiddenException(
        `Missing ${CSRF_HEADER} header on a state-changing request`,
      );
    }

    return true;
  }
}
