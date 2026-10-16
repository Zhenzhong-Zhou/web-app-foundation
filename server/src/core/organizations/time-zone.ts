import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { organizations } from '../../database/schema';
import { getTenantContext } from '../../database/tenant-context';

/**
 * An organization's time zone (ADR-072): as the request already read it
 * with the membership, or from the row for work with no request, a timer
 * or an export's later stream. Either way the same answer: the request's
 * copy is read on every request, never kept between them.
 */
export async function timeZoneOf(
  tx: Transaction,
  organizationId: string,
): Promise<string> {
  const context = getTenantContext();
  if (context?.organizationId === organizationId && context.timeZone) {
    return context.timeZone;
  }

  const [row] = await tx
    .select({ timeZone: organizations.timeZone })
    .from(organizations)
    .where(eq(organizations.id, organizationId));

  // A missing organization is a broken record, not a day: UTC, as before.
  return row?.timeZone ?? 'UTC';
}
