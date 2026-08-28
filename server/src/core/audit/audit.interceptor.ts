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
    const options = this.reflector.get<AuditOptions | undefined>(
      AUDITED,
      context.getHandler(),
    );

    if (!options) return next.handle();

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
        // The extractor was typed at the call site; the interceptor only ever
        // sees `unknown`. One cast, confined here.
        resourceId: options.resourceId?.(response),
        // No request body, ever. POST /v1/users carries a password, and the
        // reason pino redacts it applies twice as hard to a row kept for two
        // years. Payload is opt-in and explicit or it is absent.
        ip: req.ip,
        userAgent: req.headers['user-agent'],
      });
    } catch (error) {
      this.logger.error(`Audit write failed: ${String(error)}`);
    }
  }
}
