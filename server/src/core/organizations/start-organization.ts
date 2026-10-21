import { eq } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { memberships, users } from '../../database/schema';
import { giveRoles } from '../authorization/member-roles';
import { provisionOrganization } from './provision-organization';
import { uniqueSlug } from './slug';

/**
 * A new organization with an account as its Owner, in the caller's
 * transaction: what registration, accepting an organization invitation
 * and Start an organization all do (ADR-004, ADR-078), so no organization
 * ever exists without its Owner. The zone is the browser's when known, as
 * at registration (ADR-072); UTC otherwise, until an Owner sets it on
 * Profile.
 */
export async function startOrganization(
  tx: Transaction,
  input: { name: string; timeZone?: string; userId: string },
): Promise<string> {
  const slug = await uniqueSlug(tx, input.name);
  const { organizationId, roleIds } = await provisionOrganization(tx, {
    name: input.name,
    slug,
    timeZone: input.timeZone,
  });

  // Beginning at the transaction's now(), as the organization does: how
  // the welcome on Home tells the founder (ADR-079).
  const [membership] = await tx
    .insert(memberships)
    .values({ userId: input.userId, organizationId })
    .returning({ id: memberships.id });
  await giveRoles(tx, { id: membership.id, organizationId }, [roleIds.Owner]);

  return organizationId;
}

/**
 * An existing account about to start one, held to the end of the caller's
 * transaction (ADR-078): whether it belongs to an organization, and when
 * its deletion is due, are asked under the lock, so one joined or a
 * deletion scheduled meanwhile is seen. Each caller refuses in its own
 * words; the rest is what its response needs.
 */
export async function holdAccount(tx: Transaction, userId: string) {
  const [account] = await tx
    .select({
      email: users.email,
      name: users.name,
      locale: users.locale,
      emailVerifiedAt: users.emailVerifiedAt,
      deletionScheduledAt: users.deletionScheduledAt,
    })
    .from(users)
    .where(eq(users.id, userId))
    .for('update');
  const [held] = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .where(eq(memberships.userId, userId))
    .limit(1);
  return { account, belongs: held !== undefined };
}
