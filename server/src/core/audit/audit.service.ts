import { Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, lte, SQL } from 'drizzle-orm';

import { auditLog, users } from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import type { AuditAction } from './audit-actions';
import type { ListAuditDto } from './dto/list-audit.dto';

export interface AuditEntry {
  actorId: string;
  action: AuditAction;
  resourceType?: string;
  resourceId?: string;
  payload?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

export interface AuditRecord {
  id: string;
  action: string;
  resourceType: string | null;
  resourceId: string | null;
  actorId: string | null;
  /** Joined so the client is not left resolving UUIDs it cannot look up. */
  actorEmail: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: Date;
}

export interface AuditPage {
  entries: AuditRecord[];
  /** Pass as `before` for the next page. Null when the log is exhausted. */
  nextCursor: string | null;
}

const DEFAULT_LIMIT = 50;

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

  async list(query: ListAuditDto): Promise<AuditPage> {
    const limit = query.limit ?? DEFAULT_LIMIT;

    const filters = [
      // The cursor. `lt` on a UUIDv7 is "created before", because the
      // timestamp is in the most significant bits (ADR-010).
      query.before ? lt(auditLog.id, query.before) : undefined,
      query.actorId ? eq(auditLog.actorId, query.actorId) : undefined,
      query.action ? eq(auditLog.action, query.action) : undefined,
      query.resourceId ? eq(auditLog.resourceId, query.resourceId) : undefined,
      query.from ? gte(auditLog.createdAt, query.from) : undefined,
      query.to ? lte(auditLog.createdAt, query.to) : undefined,
    ].filter((f): f is SQL => f !== undefined);

    // The actor may be a tombstone (ADR-012) — anonymised, still a valid FK
    // target. innerJoin would then drop the row, which is exactly the history
    // the RESTRICT constraints exist to preserve, so this join is left.
    const rows = await this.tenantDb.selectJoinedLeft(
      auditLog,
      users,
      eq(users.id, auditLog.actorId),
      {
        id: auditLog.id,
        action: auditLog.action,
        resourceType: auditLog.resourceType,
        resourceId: auditLog.resourceId,
        actorId: auditLog.actorId,
        actorEmail: users.email,
        ip: auditLog.ip,
        userAgent: auditLog.userAgent,
        createdAt: auditLog.createdAt,
      },
      filters.length > 0 ? and(...filters) : undefined,
      // One extra row, to know whether another page exists without a count(*).
      { orderBy: desc(auditLog.id), limit: limit + 1 },
    );

    const hasMore = rows.length > limit;
    const entries = hasMore ? rows.slice(0, limit) : rows;

    return {
      // The driving table's columns are never actually null; LeftJoinedRow
      // cannot express that, so the narrowing happens once, here.
      entries: entries as unknown as AuditRecord[],
      nextCursor: hasMore ? entries[entries.length - 1].id : null,
    };
  }
}
