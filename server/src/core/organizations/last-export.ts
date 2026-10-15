import { and, desc, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { auditLog, users } from '../../database/schema';
import { AUDIT_ACTIONS } from '../audit/audit-actions';
import type { OrganizationLastExport } from './dto/organization-response.dto';

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
): Promise<OrganizationLastExport | null> {
  const [entry] = await tx
    .select({ exportedAt: auditLog.createdAt, exportedBy: users.name })
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
  return entry ?? null;
}
