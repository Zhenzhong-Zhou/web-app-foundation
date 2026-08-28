import { SetMetadata } from '@nestjs/common';

import type { AuditAction } from './audit-actions';

export const AUDITED = 'audit:options';

export interface AuditOptions<T = unknown> {
  action: AuditAction;
  resourceType?: string;
  /**
   * Pulls the affected row's id out of the handler's return value.
   *
   * An extractor rather than the interceptor guessing at `id` or `user.id`:
   * guessing works until a handler returns a shape it did not anticipate, and
   * then it silently records a row with no resource.
   */
  resourceId?: (response: T) => string | undefined;
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
