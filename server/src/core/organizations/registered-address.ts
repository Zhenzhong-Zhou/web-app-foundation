import { and, eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { addresses } from '../../database/schema';

/**
 * The organization's registered address — the one every invoice prints
 * (ADR-046) — or undefined when it has none yet.
 *
 * A function over a transaction rather than a service method, because its
 * two callers each need it inside their own transaction: the settings page
 * reading it, and invoicing copying it at issue under the invoice's lock.
 */
export async function registeredAddress(
  tx: Transaction,
  organizationId: string,
) {
  const [address] = await tx
    .select()
    .from(addresses)
    .where(
      and(
        eq(addresses.organizationId, organizationId),
        eq(addresses.ownerOrganizationId, organizationId),
        eq(addresses.isDefault, true),
        eq(addresses.isActive, true),
      ),
    );

  return address;
}
