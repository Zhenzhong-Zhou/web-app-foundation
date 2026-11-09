import { BadRequestException } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';
import { productCategories } from '../../database/schema';
import { t, type Translatable } from '../../i18n/translate';

/**
 * One change to an organization's categories at a time (ADR-092): a move
 * walks the branch it leaves, and a delete counts what is under it, and
 * neither answer holds while another change runs beside it. Two moves
 * crossing would otherwise make a loop no row shows.
 */
export async function lockTree(
  tx: Transaction,
  organizationId: string,
): Promise<void> {
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtextextended(${`product_categories:${organizationId}`}, 0))`,
  );
}

/**
 * A category named in a body is this organization's, or the body is
 * refused with a 400, as any id in a body is (ADR-003): another
 * organization's is not found, never used.
 */
export async function assertCategoryIn(
  tx: Transaction,
  organizationId: string,
  categoryId: string,
  refusal: Translatable,
): Promise<void> {
  const [found] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(
      and(
        eq(productCategories.organizationId, organizationId),
        eq(productCategories.id, categoryId),
      ),
    );
  if (!found) throw new BadRequestException(refusal);
}

/**
 * Whether `candidateId` is the category itself or one under it, at any
 * depth: where it cannot be moved. Walked in the database, under
 * lockTree, so the tree it walks is the one the move changes.
 */
export async function isWithinBranch(
  tx: Transaction,
  organizationId: string,
  categoryId: string,
  candidateId: string,
): Promise<boolean> {
  const { rows } = await tx.execute<{ found: boolean }>(sql`
    with recursive branch as (
      select id from product_categories
      where id = ${categoryId} and organization_id = ${organizationId}
      union all
      select child.id from product_categories child
      join branch on child.parent_id = branch.id
        and child.organization_id = ${organizationId}
    )
    select exists (select 1 from branch where id = ${candidateId}) as found
  `);
  return rows[0]?.found === true;
}

/** The refusal of a category in a body that is not this organization's. */
export const UNKNOWN_CATEGORY = t({
  id: 'productCategories.unknown',
  defaultMessage: 'That category was not found. Choose another, or none.',
});
