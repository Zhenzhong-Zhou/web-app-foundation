import { sql } from 'drizzle-orm';

import type { Transaction } from '../../database/database.module';

/**
 * The places above each place given, by name, its warehouse or site first
 * (57a): read after a page's rows are chosen, for theirs alone, never in
 * the counts or a sort. The tree is at most five deep; ten stops a loop.
 * Stock's reads, Where it stands' and a lot's trace (#639) each send it,
 * only to a reader with `locations.view`.
 */
export async function pathsOf(
  tx: Transaction,
  organizationId: string,
  placeIds: string[],
): Promise<Map<string, string[]>> {
  const ids = [...new Set(placeIds)];
  if (!ids.length) return new Map();
  const org = sql`${organizationId}::uuid`;
  const { rows } = await tx.execute<{ place_id: string; path: string[] }>(sql`
    with recursive up (place_id, parent_id, name, depth) as (
      select l.id, l.parent_id, l.name, 0
      from locations l
      where l.organization_id = ${org}
        and l.id in (${sql.join(
          ids.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
      union all
      select up.place_id, p.parent_id, p.name, up.depth + 1
      from up
      join locations p
        on p.id = up.parent_id
        and p.organization_id = ${org}
      where up.depth < 10
    )
    select place_id,
      coalesce(
        array_agg(name order by depth desc) filter (where depth > 0),
        '{}'
      ) as path
    from up
    group by place_id
  `);
  return new Map(rows.map((row) => [row.place_id, row.path]));
}
