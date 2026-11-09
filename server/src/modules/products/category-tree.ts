import { BadRequestException } from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';

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

/**
 * Every category of the organization with its path from the top
 * (ADR-092), as rows `id, ids, names, sort_key`, a parenthesised
 * subquery: `ids` and `names` top first and its own last, as a row shows
 * it and as Items narrows to a branch; `sort_key`, the names in their
 * order (a Chinese one by its pinyin, the others accent-free) joined by a
 * tab, which sorts before any character a name keeps there, so a category
 * comes before those under it, and they before the next beside it.
 */
export function categoryPaths(organizationId: string): SQL {
  const org = sql`${organizationId}::uuid`;
  const sortName = sql`coalesce(c.name_pinyin, search_text(c.name))`;

  return sql`(
    with recursive paths as (
      select c.id, array[c.id] as ids, array[c.name] as names,
        ${sortName} as sort_key
      from product_categories c
      where c.organization_id = ${org} and c.parent_id is null
      union all
      select c.id, p.ids || c.id, p.names || c.name,
        p.sort_key || chr(9) || ${sortName}
      from product_categories c
      join paths p on c.parent_id = p.id
      where c.organization_id = ${org}
    )
    select id, ids, names, sort_key from paths
  )`;
}

/** The refusal of a category in a body that is not this organization's. */
export const UNKNOWN_CATEGORY = t({
  id: 'productCategories.unknown',
  defaultMessage: 'That category was not found. Choose another, or none.',
});
