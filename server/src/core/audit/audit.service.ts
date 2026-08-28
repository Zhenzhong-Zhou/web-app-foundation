import { Injectable } from '@nestjs/common';

import { auditLog } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { AuditAction } from './audit-actions';

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

/**
 * Writes audit rows through TenantDb, so organization_id is stamped from
 * tenant context rather than passed in — an audit row attributed to the wrong
 * organization is worse than no row.
 *
 * ADR-012 requires ip and user_agent to be captured **at event time**: the
 * user row is anonymised on deletion and stops identifying anyone, so what the
 * audit row holds is all that survives.
 */
@Injectable()
export class AuditService {
  constructor(private readonly tenantDb: TenantDb) {}

  async record(entry: AuditEntry): Promise<void> {
    await this.tenantDb.insert(auditLog, {
      actorId: entry.actorId,
      action: entry.action,
      resourceType: entry.resourceType,
      resourceId: entry.resourceId,
      payload: entry.payload,
      ip: entry.ip,
      userAgent: entry.userAgent,
    });
  }
}
