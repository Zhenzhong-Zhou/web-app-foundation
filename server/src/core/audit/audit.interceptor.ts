import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  Logger,
  type NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { concatMap, type Observable } from 'rxjs';

import { getRequestContext } from '../auth/request-context';
import { AuditService } from './audit.service';
import { enterAuditContext, takePrevious } from './audit-context';
import { AUDITED, type AuditOptions } from './audited.decorator';

/**
 * Writes an audit row after a handler marked @Audited() succeeds.
 *
 * concatMap rather than tap: the row must be written before the response goes
 * out, or a client that reads the audit log immediately afterwards races the
 * write. Errors bypass this operator entirely, which is the point — a failed
 * action is not an action.
 *
 * A failed *write* is logged and swallowed. The action already committed by
 * the time this runs, so failing the request now would report failure for
 * something that happened, and the caller would retry and do it twice.
 *
 * That is the honest cost of an interceptor: the audit row is not in the same
 * transaction as the action it records, so a crash between them loses the row.
 * Writing inside the transaction would mean every service knowing about
 * auditing. Revisit if tamper-evidence ever needs to be a guarantee rather
 * than a strong default.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger(AuditInterceptor.name);

  constructor(
    private readonly reflector: Reflector,
    private readonly audit: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const options = this.reflector.get<AuditOptions>(
      AUDITED,
      context.getHandler(),
    );

    if (!options) return next.handle();

    enterAuditContext();

    const req = context.switchToHttp().getRequest<Request>();

    return next.handle().pipe(
      concatMap(async (response: unknown) => {
        await this.write(options, req, response);
        return response;
      }),
    );
  }

  private async write(
    options: AuditOptions,
    req: Request,
    response: unknown,
  ): Promise<void> {
    const context = getRequestContext(req);

    // @Audited() on a @Public() route. Nothing to attribute the event to, and
    // audit_log.organization_id is NOT NULL by design.
    if (!context?.organizationId) {
      this.logger.warn(
        `@Audited() on an unauthenticated route: ${req.method} ${req.originalUrl}`,
      );
      return;
    }

    try {
      await this.audit.record({
        actorId: context.userId,
        action: options.action,
        resourceType: options.resourceType,
        // Narrowed for the extractor: Express types params as
        // `string | string[]` to allow wildcard routes, which this codebase
        // has none of. One cast here rather than a String() wrapper at every
        // path-based call site.
        resourceId: options.resourceId?.(
          response,
          req as Request<Record<string, string>>,
        ),

        /**
         * Only the fields a route named. The reason pino redacts passwords
         * applies twice as hard to a row kept for two years, so the body is
         * never recorded wholesale (ADR-018).
         */
        payload: combine(pick(req.body, options.fields), takePrevious()),

        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (error) {
      this.logger.error(`Audit write failed: ${String(error)}`);
    }
  }
}

/**
 * `{ field: { from, to } }` where a previous value was recorded, and the bare
 * new value where it was not.
 *
 * Both shapes in one column deliberately: a route that reports no previous
 * value should not be indistinguishable from one whose old value was null.
 */
function combine(
  current: Record<string, unknown> | undefined,
  previous: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!current) return undefined;
  if (!previous) return current;

  return Object.fromEntries(
    Object.entries(current).map(([key, to]) =>
      key in previous ? [key, { from: previous[key], to }] : [key, to],
    ),
  );
}

/**
 * The named fields of a body, or undefined when a route named none.
 *
 * undefined rather than an empty object: a null payload says "this route does
 * not record values", while `{}` would say "it does, and nothing changed".
 */
function pick(
  body: unknown,
  fields: readonly string[] | undefined,
): Record<string, unknown> | undefined {
  if (!fields?.length || typeof body !== 'object' || body === null) {
    return undefined;
  }

  const source = body as Record<string, unknown>;
  const picked: Record<string, unknown> = {};

  for (const field of fields) {
    if (field in source) picked[field] = source[field];
  }

  return Object.keys(picked).length > 0 ? picked : undefined;
}
