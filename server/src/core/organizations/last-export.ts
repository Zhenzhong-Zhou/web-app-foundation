import { and, desc, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { auditLog, users } from '../../database/schema';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import type { OrganizationLastExport } from './dto/organization-response.dto';

/**
 * How recent the export a deletion relies on must be (ADR-070). Decided
 * here, once: the deletion refuses an older one, and the dialog says so
 * from the same answer rather than its own clock.
 */
const EXPORT_FRESH_MS = 24 * 60 * 60 * 1000;

/**
 * The organization's last full export, from the audit entry each one
 * writes (ADR-070), or null before the first.
 *
 * A function over a transaction rather than a service method, because its
 * two callers each need it inside their own transaction: the settings page
 * showing it, and a deletion request counting its 24 hours from it under
 * the organization's lock. By its resource, the organization itself, so
 * the resource index finds the few entries about it rather than the whole
 * log.
 */
export async function lastExportOf(
  tx: Transaction,
  organizationId: string,
  now: Date = new Date(),
): Promise<OrganizationLastExport | null> {
  const [entry] = await tx
    .select({
      exportedAt: auditLog.createdAt,
      exportedBy: users.name,
      exportedById: users.id,
    })
    .from(auditLog)
    .innerJoin(users, eq(users.id, auditLog.actorId))
    .where(
      and(
        eq(auditLog.organizationId, organizationId),
        eq(auditLog.resourceType, 'organization'),
        eq(auditLog.resourceId, organizationId),
        eq(auditLog.action, AUDIT_ACTIONS.ORGANIZATION_EXPORTED),
      ),
    )
    .orderBy(desc(auditLog.createdAt))
    .limit(1);
  if (!entry) return null;
  return {
    ...entry,
    fresh: entry.exportedAt.getTime() > now.getTime() - EXPORT_FRESH_MS,
  };
}
