import { SetMetadata } from '@nestjs/common';
import type { Request } from 'express';

import type { AuditAction } from './audit-actions';

export const AUDITED = 'audit:options';

export interface AuditOptions<T = unknown> {
  action: AuditAction;
  resourceType?: string;
  /**
   * Pulls the affected row's id out of the handler's return value, or off the
   * request when there is no body to read.
   *
   * An extractor rather than the interceptor guessing at `id` or `user.id`:
   * guessing works until a handler returns a shape it did not anticipate, and
   * then it silently records a row with no resource.
   *
   * The request is passed because a 204 handler has no response to extract
   * from — a role change or a delete identifies its resource in the path, and
   * without this the route would return a body it does not otherwise need
   * just to satisfy the log.
   *
   * params is narrowed to string values. Express types them as
   * `string | string[]` to allow wildcard routes; this codebase has none, and
   * the alternative is a String() wrapper at every path-based call site.
   */
  resourceId?: (
    response: T,
    request: Request<Record<string, string>>,
  ) => string | undefined;
}

/**
 * Marks a handler as auditable. The default is silence.
 *
 * Recording every request would mean auditing reads, which is the wrong trade:
 * a dashboard load is twenty GETs, ADR-012 commits each row to 24 months of
 * retention, and "who changed this" is the question people actually ask.
 */
export const Audited = <T>(options: AuditOptions<T>) =>
  SetMetadata(AUDITED, options);
