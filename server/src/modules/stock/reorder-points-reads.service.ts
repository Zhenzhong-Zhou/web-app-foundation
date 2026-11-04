import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, type SQL, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { searchTerms } from '../../common/search';
import { todayOf } from '../../core/organizations/time-zone';
import {
  products,
  productVariants,
  reorderPoints,
  type ReorderRule,
  type ReorderSource,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { itemMatches } from '../products/item-search';
import type { ListReorderPointsDto } from './dto/list-reorder-points.dto';
import type {
  ComingSupply,
  ReorderPointCounts,
  ReorderPointDetail,
  ReorderPointDraft,
  ReorderPointPage,
  ReorderPointPreview,
  ReorderPointRow,
  StillNeeded,
  UsableStock,
} from './dto/reorder-point-response.dto';
import type { SetReorderPointDto } from './dto/set-reorder-point.dto';
import { namesIn } from './item-name';
import {
  keptOf,
  noPoint,
  refuseMaximumAtOrBelowPoint,
} from './reorder-points.service';
import {
  positionsOf,
  type ReorderStatus,
  statusOf,
  usableByLocation,
} from './reorder-position';
import type { Tx } from './stock.service';

/** A page of the list unless the caller asks for fewer (ADR-051). */
const PAGE_SIZE = 50;

/** A row of the list, as Postgres returns it. */
type PositionRow = {
  id: string;
  variant_id: string;
  sku: string;
  product_name: string;
  variant_name: string | null;
  unit_of_measure: string;
  source: ReorderSource;
  reorder_point: string;
  rule: ReorderRule;
  fixed_quantity: string | null;
  maximum_quantity: string | null;
  usable: string;
  coming: string;
  still_needed: string;
  in_draft: string;
  position: string;
  status: ReorderStatus;
  suggestion: string;
  suggested_multiples: string | null;
  drafted: boolean;
  /** With counted, every row the statement's conditions match. */
  matched?: number;
  /** With counted, the out among them. */
  matched_out?: number;
};

type DraftRow = {
  variant_id: string;
  kind: 'purchase' | 'run';
  id: string;
  number: string | null;
  quantity: string;
};

type UsableRow = {
  location_id: string;
  location_name: string;
  usable: string;
  /** Left out at every location, the same on each row. */
  expired_in_all: string;
  issued_in_all: string;
};

type ComingRow = {
  kind: 'purchase' | 'run';
  id: string;
  number: string | null;
  partner_name: string | null;
  quantity: string;
  expected_at: string | null;
  late: boolean;
};

type NeededRow = {
  order_id: string;
  number: string;
  partner_name: string;
  quantity: string;
};

/**
 * The positions with the item each is for, its variant and product named
 * by their tables, as itemMatches and namesIn read them. For a statement
 * whose WITH makes `p` from positionsOf.
 */
function namedPositions(organizationId: string): SQL {
  return sql`p
    join ${productVariants}
      on ${productVariants.id} = p.variant_id
      and ${productVariants.organizationId} = ${organizationId}::uuid
    join ${products}
      on ${products.id} = ${productVariants.productId}
      and ${products.organizationId} = ${organizationId}::uuid`;
}

/** The search, as every list in the app matches it (ADR-056). */
function searched(query: ListReorderPointsDto, organizationId: string): SQL[] {
  return query.search
    ? [itemMatches(searchTerms(query.search), organizationId)]
    : [];
}

function whereOf(conditions: SQL[]): SQL {
  return conditions.length > 0 ? sql`where ${and(...conditions)}` : sql``;
}

/**
 * The list's Low filter, the out among the low, and its Out (ADR-085),
 * on the positions as `p`: the list, its counts and Home's card count by
 * them alike, so See all opens what the card counted.
 */
const IS_LOW = sql`p.status in ('low', 'out')`;
const IS_OUT = sql`p.status = 'out'`;

/** Every row a page's filter and search match, and the out among them. */
interface Matched {
  all: number;
  out: number;
}

/** Home's Low stock (ADR-085): the list's first rows on Low, and its counts. */
export interface FirstLow {
  entries: ReorderPointRow[];
  /** Every row Low shows, the out among them. */
  low: number;
  out: number;
}

/** Quantities as the API sends them: four places, as the columns hold them. */
function quantity(column: SQL): SQL {
  return sql`(${column})::numeric(18, 4)::text`;
}

/**
 * Reading reorder points (ADR-085): the list of every item with a point
 * and where it stands, its counts, and an opened row's lines. Each reads
 * positionsOf, so the list, its counts and Home's card agree; nothing
 * here writes.
 */
@Injectable()
export class ReorderPointsReadsService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * A page of the list, in ADR-085's order: the low first, the furthest
   * below their point as a share of it first; then the rest, by SKU.
   *
   * The order is worked out, not indexed, so each page works out every
   * point's position and reads its slice; the cursor is a point's id, its
   * place read back from the same positions. The list grows with the
   * points an organization sets, not with its history, and ADR-051's
   * plan check holds the reads under it to their indexes.
   *
   * Items named in the locale given, or by their base names for null, as
   * the CSV export reads them (ADR-056).
   */
  async list(
    query: ListReorderPointsDto,
    locale: Locale | null,
  ): Promise<ReorderPointPage> {
    const { entries, nextCursor } = await this.page(query, locale, false);
    return { entries, nextCursor };
  }

  /**
   * Home's card (ADR-085; ADR-058, as amended): the list's first rows on
   * Low, and beside them how many rows Low shows and the out among them,
   * counted over the same positions in the same statement. So each
   * point's position is worked out once a Home request, and See all opens
   * what the card counted.
   */
  async firstLow(limit: number, locale: Locale): Promise<FirstLow> {
    const { entries, matched } = await this.page(
      { status: 'low', limit },
      locale,
      true,
    );
    return { entries, low: matched?.all ?? 0, out: matched?.out ?? 0 };
  }

  /**
   * Whether the organization has given any item a reorder point, so Home
   * tells nothing low apart from nothing watched (ADR-085).
   */
  async anySet(): Promise<boolean> {
    const [point] = await this.tenantDb.select(reorderPoints, undefined, {
      limit: 1,
    });
    return point !== undefined;
  }

  /**
   * A page of the list, as list() reads it; with `counted`, also every
   * row its filter and search match and the out among them, by window
   * counts over the statement's own rows. Never counted with a cursor,
   * which would count only the rows after it.
   */
  private page(
    query: ListReorderPointsDto,
    locale: Locale | null,
    counted: boolean,
  ): Promise<ReorderPointPage & { matched: Matched | null }> {
    const limit = query.limit ?? PAGE_SIZE;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const today = await todayOf(tx, organizationId);
      const shown = namesIn(locale, organizationId);
      const conditions = searched(query, organizationId);

      if (query.status === 'low') {
        conditions.push(IS_LOW);
      } else if (query.status === 'out') {
        conditions.push(IS_OUT);
      }

      if (query.before) {
        // Another organization's point, or one removed since: not a place
        // in this list, and a 400 says nothing about whether it exists.
        const [cursor] = await tx
          .select({ id: reorderPoints.id })
          .from(reorderPoints)
          .where(
            and(
              eq(reorderPoints.organizationId, organizationId),
              eq(reorderPoints.id, query.before),
            ),
          );

        if (!cursor) {
          throw new BadRequestException(
            t({
              id: 'stock.cursorList',
              defaultMessage: 'That cursor is not in this list',
            }),
          );
        }

        conditions.push(sql`(p.low_first, p.share, ${productVariants.sku}, p.id) > (
          select c.low_first, c.share, cv.sku, c.id
          from p c
          join product_variants cv
            on cv.id = c.variant_id
            and cv.organization_id = ${organizationId}::uuid
          where c.id = ${query.before}::uuid
        )`);
      }

      const { rows } = await tx.execute<PositionRow>(sql`
        with p as materialized (${positionsOf(organizationId, today)})
        select
          p.id,
          p.variant_id,
          ${productVariants.sku} as sku,
          ${shown.productName} as product_name,
          ${shown.variantName} as variant_name,
          ${productVariants.unitOfMeasure} as unit_of_measure,
          p.source,
          ${quantity(sql`p.reorder_point`)} as reorder_point,
          p.rule,
          ${quantity(sql`p.fixed_quantity`)} as fixed_quantity,
          ${quantity(sql`p.maximum_quantity`)} as maximum_quantity,
          ${quantity(sql`p.usable`)} as usable,
          ${quantity(sql`p.coming`)} as coming,
          ${quantity(sql`p.still_needed`)} as still_needed,
          ${quantity(sql`p.in_draft`)} as in_draft,
          ${quantity(sql`p.position`)} as position,
          p.status,
          ${quantity(sql`p.suggestion`)} as suggestion,
          p.suggested_multiples::text as suggested_multiples,
          p.drafted
          ${
            counted
              ? sql`,
                (count(*) over ())::int as matched,
                (count(*) filter (where ${IS_OUT}) over ())::int as matched_out`
              : sql``
          }
        from ${namedPositions(organizationId)}
        ${whereOf(conditions)}
        order by p.low_first, p.share, ${productVariants.sku}, p.id
        limit ${limit + 1}
      `);

      const page = pageOf(rows, limit);
      const drafts = await draftsOf(
        tx,
        organizationId,
        page.entries.map((row) => row.variant_id),
      );

      return {
        entries: page.entries.map((row) => ({
          id: row.id,
          variantId: row.variant_id,
          sku: row.sku,
          productName: row.product_name,
          variantName: row.variant_name,
          unitOfMeasure: row.unit_of_measure,
          source: row.source,
          reorderPoint: row.reorder_point,
          rule: row.rule,
          fixedQuantity: row.fixed_quantity,
          maximumQuantity: row.maximum_quantity,
          usable: row.usable,
          coming: row.coming,
          stillNeeded: row.still_needed,
          inDraft: row.in_draft,
          position: row.position,
          status: row.status,
          suggestion: row.suggestion,
          suggestedMultiples: row.suggested_multiples,
          drafted: row.drafted,
          drafts: drafts.get(row.variant_id) ?? [],
        })),
        nextCursor: page.nextCursor,
        // On every row alike; none when nothing matches.
        matched: counted
          ? { all: rows[0]?.matched ?? 0, out: rows[0]?.matched_out ?? 0 }
          : null,
      };
    });
  }

  /**
   * How many rows each of the list's filters shows, All, Low and Out,
   * with its search and the filter left off, so each number is the rows
   * pressing that one shows (ADR-055). The low count holds the out.
   *
   * The items are joined for a search alone: positionsOf already holds
   * each point to its item, so without one the join only adds work over
   * every position (#353).
   */
  counts(query: ListReorderPointsDto = {}): Promise<ReorderPointCounts> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const today = await todayOf(tx, organizationId);
      const search = searched(query, organizationId);

      const { rows } = await tx.execute<{
        all: number;
        low: number;
        out: number;
      }>(sql`
        with p as materialized (${positionsOf(organizationId, today)})
        select
          count(*)::int as "all",
          (count(*) filter (where ${IS_LOW}))::int as "low",
          (count(*) filter (where ${IS_OUT}))::int as "out"
        from ${search.length > 0 ? namedPositions(organizationId) : sql`p`}
        ${whereOf(search)}
      `);

      return rows[0];
    });
  }

  /**
   * An opened row's lines (ADR-085): usable stock by location, with what
   * was left out as expired or issued to a run; each purchase and run
   * still coming, a purchase late once its day has passed; each sale still
   * needing it; and each draft. Read by the rules positionsOf adds up, so
   * the lines make the row's figures, and the point itself, for Edit. An
   * item with no point is not found, as another organization's is, which
   * is how the dialog knows to add one.
   */
  detail(variantId: string): Promise<ReorderPointDetail> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [point] = await tx
        .select({
          source: reorderPoints.source,
          reorderPoint: reorderPoints.reorderPoint,
          rule: reorderPoints.rule,
          fixedQuantity: reorderPoints.fixedQuantity,
          maximumQuantity: reorderPoints.maximumQuantity,
        })
        .from(reorderPoints)
        .where(
          and(
            eq(reorderPoints.organizationId, organizationId),
            eq(reorderPoints.variantId, variantId),
          ),
        );

      if (!point) throw noPoint();

      const today = await todayOf(tx, organizationId);
      const org = sql`${organizationId}::uuid`;
      const item = sql`${variantId}::uuid`;

      // By location, and what was left out at all of them, from one
      // reading of where the item sits.
      const usable = await tx.execute<UsableRow>(sql`
        select
          u.location_id,
          loc.name as location_name,
          ${quantity(sql`u.usable`)} as usable,
          ${quantity(sql`sum(u.expired) over ()`)} as expired_in_all,
          ${quantity(sql`sum(u.issued) over ()`)} as issued_in_all
        from (${usableByLocation(organizationId, today, sql`(${item})`)}) u
        join locations loc
          on loc.id = u.location_id
          and loc.organization_id = ${org}
        order by loc.name, loc.id
      `);
      const [anywhere] = usable.rows;

      const coming = await tx.execute<ComingRow>(sql`
        select * from (
          select
            'purchase' as kind,
            o.id,
            o.number,
            pa.name as partner_name,
            ${quantity(sql`ol.quantity_ordered - ol.quantity_fulfilled`)} as quantity,
            o.expected_at::text as expected_at,
            coalesce(o.expected_at < ${today}::date, false) as late
          from order_lines ol
          join orders o
            on o.id = ol.order_id
            and o.organization_id = ${org}
          join partners pa
            on pa.id = o.partner_id
            and pa.organization_id = ${org}
          where ol.organization_id = ${org}
            and ol.variant_id = ${item}
            and o.direction = 'purchase'
            and o.status = 'confirmed'
            and not ol.is_closed_short
            and ol.quantity_ordered > ol.quantity_fulfilled
          union all
          select
            'run' as kind,
            po.id,
            po.reference,
            pa.name,
            ${quantity(sql`po.quantity_planned - po.quantity_produced`)},
            null,
            false
          from production_orders po
          left join partners pa
            on pa.id = po.partner_id
            and pa.organization_id = ${org}
          where po.organization_id = ${org}
            and po.output_variant_id = ${item}
            and po.status = 'released'
            and po.quantity_planned > po.quantity_produced
        ) c
        order by c.kind, c.expected_at nulls last, c.id
      `);

      const needed = await tx.execute<NeededRow>(sql`
        select
          o.id as order_id,
          o.number,
          pa.name as partner_name,
          ${quantity(sql`ol.quantity_ordered - ol.quantity_fulfilled`)} as quantity
        from order_lines ol
        join orders o
          on o.id = ol.order_id
          and o.organization_id = ${org}
        join partners pa
          on pa.id = o.partner_id
          and pa.organization_id = ${org}
        where ol.organization_id = ${org}
          and ol.variant_id = ${item}
          and o.direction = 'sale'
          and o.status = 'confirmed'
          and not ol.is_closed_short
          and ol.quantity_ordered > ol.quantity_fulfilled
        order by o.expected_at nulls last, o.number, o.id
      `);

      return {
        // Text columns its check constraints hold to the two lists.
        point: {
          source: point.source as ReorderSource,
          reorderPoint: point.reorderPoint,
          rule: point.rule as ReorderRule,
          fixedQuantity: point.fixedQuantity,
          maximumQuantity: point.maximumQuantity,
        },
        usable: usable.rows.map((row): UsableStock => ({
          locationId: row.location_id,
          locationName: row.location_name,
          usable: row.usable,
        })),
        expired: anywhere?.expired_in_all ?? '0.0000',
        issued: anywhere?.issued_in_all ?? '0.0000',
        coming: coming.rows.map((row): ComingSupply => ({
          kind: row.kind,
          id: row.id,
          number: row.number,
          partnerName: row.partner_name,
          quantity: row.quantity,
          late: row.late,
        })),
        stillNeeded: needed.rows.map((row): StillNeeded => ({
          orderId: row.order_id,
          number: row.number,
          partnerName: row.partner_name,
          quantity: row.quantity,
        })),
      };
    });
  }

  /**
   * What the dialog's values would make of an item today (ADR-085), before
   * anything is saved: its position, where it would stand, the suggestion
   * the values' rule gives, and the position once what is in draft and
   * the suggestion arrive, since the suggestion leaves out what is in
   * draft. Worked out
   * by positionsOf against the values, so it says what the list will say
   * once they are saved; for an item with a point or without one. Refused
   * as saving refuses: an item not this organization's is not found, and a
   * maximum at or below the point is a 400 with its code.
   */
  preview(
    variantId: string,
    input: SetReorderPointDto,
  ): Promise<ReorderPointPreview> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      await refuseMaximumAtOrBelowPoint(tx, input);

      const today = await todayOf(tx, organizationId);
      const typed = keptOf(input);
      const after = sql`p.position + p.in_draft + p.suggestion`;
      const afterStatus = statusOf({
        position: after,
        reorderPoint: sql`p.reorder_point`,
        rule: sql`p.rule`,
        fixedQuantity: sql`p.fixed_quantity`,
        maximumQuantity: sql`p.maximum_quantity`,
        inDraft: sql`p.in_draft`,
        active: sql`p.status <> 'discontinued'`,
      });

      const { rows } = await tx.execute<{
        position: string;
        status: ReorderStatus;
        suggestion: string;
        suggested_multiples: string | null;
        drafted: boolean;
        after: string;
        after_status: ReorderStatus;
      }>(sql`
        select
          ${quantity(sql`p.position`)} as position,
          p.status,
          ${quantity(sql`p.suggestion`)} as suggestion,
          p.suggested_multiples::text as suggested_multiples,
          p.drafted,
          ${quantity(after)} as after,
          ${afterStatus} as after_status
        from (${positionsOf(organizationId, today, variantId, typed)}) p
      `);

      // Its row comes from the item, so none means no such item here.
      const [row] = rows;
      if (!row)
        throw new NotFoundException(
          t({ id: 'stock.suchItem', defaultMessage: 'No such item' }),
        );

      return {
        position: row.position,
        status: row.status,
        suggestion: row.suggestion,
        suggestedMultiples: row.suggested_multiples,
        drafted: row.drafted,
        after: row.after,
        afterStatus: row.after_status,
      };
    });
  }
}

/**
 * The drafts adding to each item, newest first: draft purchases' lines
 * and draft runs, as positionsOf counts them in draft.
 */
async function draftsOf(
  tx: Tx,
  organizationId: string,
  variantIds: string[],
): Promise<Map<string, ReorderPointDraft[]>> {
  const found = new Map<string, ReorderPointDraft[]>();
  if (variantIds.length === 0) return found;

  const org = sql`${organizationId}::uuid`;
  const items = sql.join(
    variantIds.map((id) => sql`${id}::uuid`),
    sql`, `,
  );

  const { rows } = await tx.execute<DraftRow>(sql`
    select * from (
      select
        ol.variant_id,
        'purchase' as kind,
        o.id,
        o.number,
        ${quantity(sql`ol.quantity_ordered`)} as quantity
      from orders o
      join order_lines ol
        on ol.order_id = o.id
        and ol.organization_id = ${org}
      where o.organization_id = ${org}
        and o.direction = 'purchase'
        and o.status = 'draft'
        and ol.variant_id in (${items})
      union all
      select
        po.output_variant_id,
        'run',
        po.id,
        po.reference,
        ${quantity(sql`po.quantity_planned`)}
      from production_orders po
      where po.organization_id = ${org}
        and po.status = 'draft'
        and po.output_variant_id in (${items})
    ) d
    order by d.id desc
  `);

  for (const row of rows) {
    const drafts = found.get(row.variant_id) ?? [];
    drafts.push({
      kind: row.kind,
      id: row.id,
      number: row.number,
      quantity: row.quantity,
    });
    found.set(row.variant_id, drafts);
  }

  return found;
}
