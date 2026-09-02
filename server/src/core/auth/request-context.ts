import type { Request } from 'express';

/**
 * What a request knows about who is making it, after the session resolves.
 *
 * Carries no permissions, deliberately. ADR-004 requires those to be resolved
 * per request through the membership; caching them here would be the same
 * mistake as putting them on the session row.
 */
export interface RequestContext {
  sessionId: string;
  userId: string;
  email: string;
  name: string;
  /** Null when the user belongs to no organization — see SessionGuard. */
  organizationId: string | null;
  /** Null whenever organizationId is. Step 4's permission guard reads this. */
  roleId: string | null;
  /** Captured per request, not read off the session row: ADR-012 requires
   *  these at event time, and the session's values are from its creation. */
  ip?: string;
  userAgent?: string;
}

// A symbol rather than a declaration-merged property on Express's Request:
// nothing else can collide with it, and it needs no global .d.ts that every
// file then depends on.
const REQUEST_CONTEXT = Symbol('requestContext');

type WithContext = Request & { [REQUEST_CONTEXT]?: RequestContext };

export function setRequestContext(req: Request, context: RequestContext): void {
  (req as WithContext)[REQUEST_CONTEXT] = context;
}

export function getRequestContext(req: Request): RequestContext | undefined {
  return (req as WithContext)[REQUEST_CONTEXT];
}
