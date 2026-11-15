import { eq, sql } from 'drizzle-orm';

import type { Locale } from '../../common/locales';
import type { Transaction } from '../../database/database.module';
import { organizations } from '../../database/schema';
import { MAX_CHANGED_AT_ONCE } from './dto/change-products.dto';
import type { ProductNameToChoose } from './dto/product-name-language-response.dto';

/**
 * The language the organization's items are named in (ADR-054, amended for
 * #531), or null while not set, read under a lock on its row: `update` by
 * the choice of it, `share` by each names save, which so waits for a choice
 * under way rather than keep a name in the language being chosen.
 */
export async function productNameLanguageOf(
  tx: Transaction,
  organizationId: string,
  lock: 'update' | 'share',
): Promise<Locale | null> {
  const [organization] = await tx
    .select({ language: organizations.productNameLanguage })
    .from(organizations)
    .where(eq(organizations.id, organizationId))
    .for(lock);
  return organization?.language ?? null;
}

/**
 * A name kept in the language that differs from the own name it would
 * replace, as the preview lists it, with what History needs beside it.
 */
export interface NameToChoose extends ProductNameToChoose {
  /** The item's own name, which History labels a variant's row with. */
  itemName: string;
}

/** What choosing a language will do, as namesToChoose works it out. */
export interface NamesToChoose {
  /** Own names that will count as the language's: every item's. */
  items: number;
  /** And every variant's with a name of its own. */
  variants: number;
  /** Names kept in it the same as the own one, removed as copies. */
  copies: number;
  /** Names kept in it that differ, each to be chosen. */
  total: number;
  /** Those that differ, at most MAX_CHANGED_AT_ONCE, by their item's name. */
  differing: NameToChoose[];
}

/** As Postgres returns it, its columns named as NameToChoose's fields. */
type ListRow = Omit<NamesToChoose, 'differing'> & {
  differing: NameToChoose[] | null;
};

/**
 * The one place that works out which names kept in a language are copies
 * and which differ (ADR-054, amended for #531), for the preview, the
 * choice, and the choice's check that the list is still the one shown.
 *
 * A copy is a kept name the same as the own one, its description empty or
 * the same; anything else differs, a description too. A variant's kept
 * name differs from no name of its own. Every join names the organization
 * (#226).
 */
export async function namesToChoose(
  tx: Transaction,
  organizationId: string,
  language: Locale,
): Promise<NamesToChoose> {
  const org = sql`${organizationId}::uuid`;
  const order = sql`"itemName" collate numeric_order, "productId", kind,
    sku collate numeric_order`;

  const {
    rows: [row],
  } = await tx.execute<ListRow>(sql`
    with kept as (
      select 'item' as kind, p.id, p.id as "productId", null::text as sku,
        p.name as "ownName", pt.name as "keptName",
        p.description as "ownDescription", pt.description as "keptDescription",
        p.name as "itemName",
        pt.name = p.name and (pt.description is null
          or pt.description is not distinct from p.description) as copy
      from product_translations pt
      join products p on p.id = pt.product_id and p.organization_id = ${org}
      where pt.organization_id = ${org} and pt.locale = ${language}
      union all
      select 'variant', v.id, v.product_id, v.sku, v.name, vt.name,
        null, null, p.name, vt.name is not distinct from v.name
      from variant_translations vt
      join product_variants v
        on v.id = vt.variant_id and v.organization_id = ${org}
      join products p on p.id = v.product_id and p.organization_id = ${org}
      where vt.organization_id = ${org} and vt.locale = ${language}
    ),
    listed as (
      select * from kept where not copy
      order by ${order}
      limit ${MAX_CHANGED_AT_ONCE}
    )
    select
      (select count(*)::int from products where organization_id = ${org})
        as items,
      (select count(*)::int from product_variants
        where organization_id = ${org} and name is not null) as variants,
      (select count(*)::int from kept where copy) as copies,
      (select count(*)::int from kept where not copy) as total,
      (select json_agg(listed order by ${order}) from listed) as differing
  `);

  return { ...row, differing: row.differing ?? [] };
}
