import { Inject, Injectable, type NestMiddleware } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { NextFunction, Request, Response } from 'express';

import type { Database } from '../../database/database.module';
import { UNSAFE_GLOBAL_DB } from '../../database/database.tokens';
import { memberships, users } from '../../database/schema';
import { runInTenantContext } from '../../database/tenant-context';
import { type RequestContext, setRequestContext } from './request-context';
import { SessionService } from './session.service';
import { readSessionCookie } from './session-cookie';

/**
 * Resolves the session cookie to (user, current_org) and runs the rest of the
 * request inside that tenant context (ADR-003).
 *
 * Middleware rather than a guard or an interceptor. AsyncLocalStorage only
 * holds context for the duration of its callback, and a guard returns a
 * boolean — there is nothing to wrap. An interceptor is worse: next.handle()
 * is a lazy Observable, so the handler runs on subscribe, after run() has
 * already exited, and the context is gone by the time the query fires.
 *
 * Never throws. A missing or invalid cookie simply produces no context; the
 * guard decides whether that is acceptable for the route.
 */
@Injectable()
export class SessionContextMiddleware implements NestMiddleware {
  constructor(
    @Inject(UNSAFE_GLOBAL_DB) private readonly db: Database,
    private readonly sessions: SessionService,
  ) {}

  async use(req: Request, _res: Response, next: NextFunction): Promise<void> {
    const token = readSessionCookie(req);
    if (!token) return next();

    const context = await this.resolve(token, req);
    if (!context) return next();

    setRequestContext(req, context);

    if (context.organizationId === null) return next();

    // next() is called synchronously inside run(), so everything downstream —
    // guards, pipes, the handler, TenantDb — sees this store.
    runInTenantContext(
      { userId: context.userId, organizationId: context.organizationId },
      () => next(),
    );
  }

  private async resolve(
    token: string,
    req: Request,
  ): Promise<RequestContext | null> {
    const session = await this.sessions.validate(token);
    if (!session) return null;

    const [user] = await this.db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        deletedAt: users.deletedAt,
      })
      .from(users)
      .where(eq(users.id, session.userId));

    // A tombstoned user (ADR-012) keeps its row so audit_log.actor_id stays
    // valid, but must not authenticate.
    if (!user || user.deletedAt !== null) return null;

    // Re-read every request, never cached. The session's current_org_id is a
    // pointer, not a grant: someone removed from an organization has to lose
    // access on their next request, not at session expiry (ADR-004).
    const membership = session.currentOrgId
      ? await this.findMembership(user.id, session.currentOrgId)
      : undefined;

    return {
      sessionId: session.sessionId,
      userId: user.id,
      email: user.email,
      name: user.name,
      organizationId: membership?.organizationId ?? null,
      roleId: membership?.roleId ?? null,
      // Captured per request rather than read off the session row: ADR-012
      // wants these at event time, and the session's values are from
      // whenever it was created.
      ip: req.ip,
      userAgent: req.headers['user-agent'],
    };
  }

  private async findMembership(userId: string, organizationId: string) {
    const [row] = await this.db
      .select({
        organizationId: memberships.organizationId,
        roleId: memberships.roleId,
      })
      .from(memberships)
      .where(
        and(
          eq(memberships.userId, userId),
          eq(memberships.organizationId, organizationId),
        ),
      );

    return row;
  }
}
