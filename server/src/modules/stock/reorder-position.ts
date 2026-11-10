import { type SQL, sql } from 'drizzle-orm';

/**
 * Where an item with a reorder point stands (ADR-085): out at zero or
 * less, nothing usable and nothing coming; low below its point; enough
 * otherwise. A discontinued item, or one of a discontinued product,
 * keeps its point and is never low.
 */
export const REORDER_STATUSES = [
  'out',
  'low',
  'enough',
  'discontinued',
] as const;

export type ReorderStatus = (typeof REORDER_STATUSES)[number];

/**
 * A point as the dialog holds it before saving (ADR-085): the preview
 * works the item out against these, not its kept point. The quantity its
 * rule does not use is null.
 */
export interface TypedPoint {
  source: string;
  reorderPoint: string;
  rule: string;
  fixedQuantity: string | null;
  maximumQuantity: string | null;
}

/** A point's figures, as SQL, for the status and the suggestion. */
export interface PositionFigures {
  position: SQL;
  reorderPoint: SQL;
  rule: SQL;
  fixedQuantity: SQL;
  maximumQuantity: SQL;
  inDraft: SQL;
  /** Neither the variant nor its product discontinued. */
  active: SQL;
}

/** Below its point and not discontinued: the out among the low. */
function isLow(f: PositionFigures): SQL {
  return sql`(${f.active} and ${f.position} < ${f.reorderPoint})`;
}

/** Out, low, enough or discontinued, as REORDER_STATUSES names them. */
export function statusOf(f: PositionFigures): SQL {
  return sql`case
    when not ${f.active} then 'discontinued'
    when ${f.position} <= 0 then 'out'
    when ${f.position} < ${f.reorderPoint} then 'low'
    else 'enough'
  end`;
}

/**
 * The shortfall a low item's rule fills, less what is in draft, never
 * below zero: back to the point, or up to the maximum. Zero when it is
 * not low.
 */
function shortfallOf(f: PositionFigures): SQL {
  return sql`case when ${isLow(f)} then greatest(0,
    case when ${f.rule} = 'maximum' then ${f.maximumQuantity} else ${f.reorderPoint} end
      - ${f.position} - ${f.inDraft}
  ) else 0 end`;
}

/**
 * How many of a fixed rule's quantity the suggestion is, "2 × 1,000":
 * the shortfall in whole multiples, rounded up, as a supplier sells in
 * cases. Null for the other rules.
 */
export function multiplesOf(f: PositionFigures): SQL {
  return sql`case when ${f.rule} = 'fixed'
    then ceil(${shortfallOf(f)} / ${f.fixedQuantity})
  end`;
}

/**
 * The suggested order (ADR-085): what the item's rule asks to bring the
 * position back to the point, or to its maximum, less what is in draft,
 * never below zero; a fixed rule's in whole multiples of its quantity. A
 * low item whose suggestion is zero is drafted, so nobody orders it twice.
 * Worked out here, in Postgres, never in JavaScript (ADR-025).
 */
export function suggestionOf(f: PositionFigures): SQL {
  return sql`case when ${f.rule} = 'fixed'
    then ${multiplesOf(f)} * ${f.fixedQuantity}
    else ${shortfallOf(f)}
  end`;
}

/**
 * Drafted (ADR-085): low, and what is in draft leaves nothing to suggest,
 * so its row says so and nobody orders it twice.
 */
export function draftedOf(f: PositionFigures): SQL {
  return sql`(${isLow(f)} and (${suggestionOf(f)}) = 0)`;
}

/**
 * Stock where it can be used, per item and per location marked
 * available (ADR-085): on hand in lots not expired by the organization's
 * today (ADR-072), less what released runs at that location were issued
 * and have not consumed; beside it, what was left out as expired and as
 * issued. Rows `variant_id, location_id, usable, expired, issued`, for
 * the items in `variants`, a parenthesised list or subquery of ids.
 *
 * Issued is read from the runs' lines, not the ledger: a release whose
 * source is the run's own location moves nothing, and the run still
 * consumes from it at close (ADR-032). It is taken from the stock not
 * expired, never below zero, so stock moved off a run's location is not
 * left out twice.
 *
 * Raw SQL with every table aliased, so a caller may name the outer
 * tables as it likes.
 */
export function usableByLocation(
  organizationId: string,
  today: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`
    select
      s.variant_id,
      s.location_id,
      greatest(0, s.unexpired - coalesce(i.quantity, 0)) as usable,
      s.expired,
      least(s.unexpired, coalesce(i.quantity, 0)) as issued
    from (
      select
        sl.variant_id,
        sl.location_id,
        coalesce(sum(sl.quantity) filter (
          where lt.expires_at < ${today}::date
        ), 0) as expired,
        coalesce(sum(sl.quantity) filter (
          where lt.expires_at is null or lt.expires_at >= ${today}::date
        ), 0) as unexpired
      from stock_levels sl
      join locations loc
        on loc.id = sl.location_id
        and loc.organization_id = ${org}
      left join lots lt
        on lt.id = sl.lot_id
        and lt.organization_id = ${org}
      where sl.organization_id = ${org}
        and sl.variant_id in ${variants}
        and sl.quantity > 0
        and loc.is_available
      group by sl.variant_id, sl.location_id
    ) s
    left join (
      select
        pol.component_variant_id as variant_id,
        po.location_id,
        sum(pol.quantity_planned - pol.quantity_consumed) as quantity
      from production_orders po
      join production_order_lines pol
        on pol.production_order_id = po.id
        and pol.organization_id = ${org}
      where po.organization_id = ${org}
        and po.status = 'released'
        and pol.supply_type = 'stocked'
        and pol.component_variant_id in ${variants}
      group by pol.component_variant_id, po.location_id
    ) i on i.variant_id = s.variant_id and i.location_id = s.location_id
  `;
}

/**
 * Every item with a reorder point and its position (ADR-085), or the one
 * asked for: as a subquery's rows, one per point, for the list, its
 * counts and Home's card to read alike.
 *
 * - usable: usableByLocation's, summed;
 * - coming: confirmed purchases' lines still to receive (ordered less
 *   received, unless closed short), and released runs' output still to
 *   come (planned less produced, never below zero);
 * - still needed: confirmed sales' lines still to ship, unless closed
 *   short, as ADR-045 counts them;
 * - in draft: draft purchases' quantities and draft runs' planned output,
 *   which do not change the position, since a draft may never be sent;
 * - position: usable, plus coming, less still needed;
 * - drafted: low, and what is in draft leaves nothing to suggest, so
 *   nobody orders it twice.
 *
 * The open lines are read on order_lines_open_idx's own predicate, as
 * the holds are (availability.ts): keep the two the same. Draft
 * purchases' lines are read from the drafts, which are few, never from
 * the items' every line: by item, the low list read 40,000 lines at
 * ADR-051's large scale to find a few hundred. Every join names the
 * organization (ADR-003, ADR-051).
 *
 * Its order is the list's: the low first, the furthest below their point
 * as a share of it first (`low_first`, `share`), then the rest, by SKU,
 * which the caller joins.
 *
 * `variants` is the one item asked for, by its id, or a set of them, a
 * parenthesised list or subquery of ids: Items' rows, a page at a time
 * (ADR-092).
 *
 * With `typed`, the one item asked for is worked out against the values
 * given instead of its kept point, whether it has one or not: the
 * dialog's preview, before anything is saved. Its row's id is null.
 */
export function positionsOf(
  organizationId: string,
  today: string,
  variants?: string | SQL,
  typed?: TypedPoint,
): SQL {
  const org = sql`${organizationId}::uuid`;
  const variantId = typeof variants === 'string' ? variants : undefined;
  const only =
    variants === undefined
      ? sql``
      : variantId
        ? sql`and rp.variant_id = ${variantId}::uuid`
        : sql`and rp.variant_id in ${variants}`;
  const asked = sql`(select pt.variant_id from points pt)`;

  const figures: PositionFigures = {
    position: sql`f.position`,
    reorderPoint: sql`f.reorder_point`,
    rule: sql`f.rule`,
    fixedQuantity: sql`f.fixed_quantity`,
    maximumQuantity: sql`f.maximum_quantity`,
    inDraft: sql`f.in_draft`,
    active: sql`f.active`,
  };

  return sql`
    with points as materialized (
      ${
        typed && variantId
          ? sql`select
              null::uuid as id,
              pv.id as variant_id,
              ${typed.source}::text as source,
              ${typed.reorderPoint}::numeric as reorder_point,
              ${typed.rule}::text as rule,
              ${typed.fixedQuantity}::numeric as fixed_quantity,
              ${typed.maximumQuantity}::numeric as maximum_quantity,
              (pv.is_active and pr.is_active) as active
            from product_variants pv
            join products pr
              on pr.id = pv.product_id
              and pr.organization_id = ${org}
            where pv.organization_id = ${org}
              and pv.id = ${variantId}::uuid`
          : sql`select
              rp.id,
              rp.variant_id,
              rp.source,
              rp.reorder_point,
              rp.rule,
              rp.fixed_quantity,
              rp.maximum_quantity,
              (pv.is_active and pr.is_active) as active
            from reorder_points rp
            join product_variants pv
              on pv.id = rp.variant_id
              and pv.organization_id = ${org}
            join products pr
              on pr.id = pv.product_id
              and pr.organization_id = ${org}
            where rp.organization_id = ${org}
              ${only}`
      }
    ),
    usable as (
      select u.variant_id, sum(u.usable) as quantity
      from (${usableByLocation(organizationId, today, asked)}) u
      group by u.variant_id
    ),
    coming as (
      select ol.variant_id, ol.quantity_ordered - ol.quantity_fulfilled as quantity
      from order_lines ol
      join orders o
        on o.id = ol.order_id
        and o.organization_id = ${org}
      where ol.organization_id = ${org}
        and ol.variant_id in ${asked}
        and o.direction = 'purchase'
        and o.status = 'confirmed'
        and not ol.is_closed_short
        and ol.quantity_ordered > ol.quantity_fulfilled
      union all
      select po.output_variant_id, greatest(0, po.quantity_planned - po.quantity_produced)
      from production_orders po
      where po.organization_id = ${org}
        and po.status = 'released'
        and po.output_variant_id in ${asked}
    ),
    needed as (
      select ol.variant_id, ol.quantity_ordered - ol.quantity_fulfilled as quantity
      from order_lines ol
      join orders o
        on o.id = ol.order_id
        and o.organization_id = ${org}
      where ol.organization_id = ${org}
        and ol.variant_id in ${asked}
        and o.direction = 'sale'
        and o.status = 'confirmed'
        and not ol.is_closed_short
        and ol.quantity_ordered > ol.quantity_fulfilled
    ),
    draft_lines as materialized (
      select ol.variant_id, ol.quantity_ordered as quantity
      from orders o
      join order_lines ol
        on ol.order_id = o.id
        and ol.organization_id = ${org}
      where o.organization_id = ${org}
        and o.direction = 'purchase'
        and o.status = 'draft'
    ),
    drafted as (
      select dl.variant_id, dl.quantity
      from draft_lines dl
      where dl.variant_id in ${asked}
      union all
      select po.output_variant_id, po.quantity_planned
      from production_orders po
      where po.organization_id = ${org}
        and po.status = 'draft'
        and po.output_variant_id in ${asked}
    ),
    figures as (
      select
        p.*,
        coalesce(u.quantity, 0) as usable,
        coalesce(c.quantity, 0) as coming,
        coalesce(n.quantity, 0) as still_needed,
        coalesce(d.quantity, 0) as in_draft,
        coalesce(u.quantity, 0) + coalesce(c.quantity, 0) - coalesce(n.quantity, 0) as position
      from points p
      left join usable u on u.variant_id = p.variant_id
      left join (
        select variant_id, sum(quantity) as quantity from coming group by variant_id
      ) c on c.variant_id = p.variant_id
      left join (
        select variant_id, sum(quantity) as quantity from needed group by variant_id
      ) n on n.variant_id = p.variant_id
      left join (
        select variant_id, sum(quantity) as quantity from drafted group by variant_id
      ) d on d.variant_id = p.variant_id
    )
    select
      f.id,
      f.variant_id,
      f.source,
      f.reorder_point,
      f.rule,
      f.fixed_quantity,
      f.maximum_quantity,
      f.usable,
      f.coming,
      f.still_needed,
      f.in_draft,
      f.position,
      ${statusOf(figures)} as status,
      ${suggestionOf(figures)} as suggestion,
      ${multiplesOf(figures)} as suggested_multiples,
      ${draftedOf(figures)} as drafted,
      case when ${isLow(figures)} then 0 else 1 end as low_first,
      case when ${isLow(figures)} then f.position / f.reorder_point else 0 end as share
    from figures f
  `;
}
