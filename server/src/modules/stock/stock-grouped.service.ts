import { Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, or, type SQL, sql } from 'drizzle-orm';

import { pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { searchTerms } from '../../common/search';
import {
  afterKeys,
  cursorOf,
  type KeyPart,
  notInThisList,
  orderOf,
  readKeys,
  type SortOrder,
} from '../../common/sorted-page';
import { dayIn, todayIn } from '../../common/today';
import { timeZoneOf } from '../../core/organizations/time-zone';
import type { Transaction } from '../../database/database.module';
import { assertOwnIds } from '../../database/own-ids';
import {
  locations,
  type LotExpiry,
  lots,
  organizations,
  products,
  type ProductType,
  productVariants,
  stockLevels,
} from '../../database/schema';
import { TenantDb } from '../../database/tenant-db.service';
import { t } from '../../i18n/translate';
import { inCategoryOrBelow } from '../products/category-tree';
import { itemMatches } from '../products/item-search';
import { coverOf } from '../products/product-images';
import { comingOf, openSaleLines } from './availability';
import {
  codeFigures,
  expiresFirstOf,
  figureColumns,
  type FigureRow,
  figuresOf,
  quantity,
  type SortedFigure,
  sortedFigure,
} from './code-figures';
import type {
  ListStockByCodeDto,
  ListStockByLotDto,
  StockFiltersDto,
  StockLotFiltersDto,
  StockLotSort,
  StockPlacesDto,
} from './dto/list-stock-grouped.dto';
import type {
  IssuedRun,
  StockCodeCounts,
  StockCodePage,
  StockCodePlaces,
  StockCodeRow,
  StockLotCounts,
  StockLotPage,
  StockPlace,
} from './dto/stock-grouped-response.dto';
import { latestFormerCode } from './former-codes';
import { namesIn, productNameOrder } from './item-name';
import { lotMatches } from './lot-search';
import { openRunIssued } from './open-run';
import { pathsOf } from './place-paths';
import {
  quickFiltersOf,
  stockRowsOf,
  UNKNOWN_ITEM,
} from './stock-reads.service';
import { onHandByItem } from './usable-stock';

/** A page of Inventory, fifty codes or lots unless asked (ADR-093, R16). */
const PAGE_SIZE = 50;

/**
 * Which piles a read lists (20a): those holding stock, and with Include
 * empty the emptied ones too, but not, for a code that tracks lots, its
 * emptied pile with no lot: its stock from before is in a lot now, as its
 * opened row reads it, so the pile would list a code with nothing to open
 * (ADR-094). One rule for the row per code and its places (review 54).
 */
function keptPiles(
  includeEmpty: boolean,
  pile: { quantity: SQL; lotId: SQL; tracksLots: SQL },
): SQL {
  return includeEmpty
    ? sql`not (${pile.quantity} = 0 and ${pile.lotId} is null and ${pile.tracksLots})`
    : sql`${pile.quantity} > 0`;
}

/**
 * The codes a row per code lists before its quick filters (A2): every
 * code with stock on hand, held or wanted by a confirmed sale, coming on a
 * confirmed purchase or a released run, or watched by a reorder point, so
 * Out lists a code at 0; all of them with Include empty. At one place,
 * what is there, its emptied rows with Include empty (20a). The outer
 * query names `product_variants` by its table.
 */
function presentOf(
  query: StockFiltersDto,
  organizationId: string,
): SQL | undefined {
  const org = sql`${organizationId}::uuid`;
  const kept = sql`and ${keptPiles(query.includeEmpty === 'true', {
    quantity: sql`sl.quantity`,
    lotId: sql`sl.lot_id`,
    tracksLots: sql`exists (
      select 1 from product_variants tracked
      where tracked.organization_id = ${org}
        and tracked.id = sl.variant_id
        and tracked.tracks_lots
    )`,
  })}`;

  if (query.locationId) {
    return sql`${productVariants.id} in (
      select sl.variant_id from stock_levels sl
      where sl.organization_id = ${org}
        and sl.location_id = ${query.locationId}::uuid
        ${kept}
    )`;
  }
  if (query.includeEmpty === 'true') return undefined;

  return sql`${productVariants.id} in (
    select sl.variant_id from stock_levels sl
    where sl.organization_id = ${org} and sl.quantity > 0
    union all
    -- Still needed and coming, by the rules the figures sum (availability.ts).
    select sl2.variant_id from (${openSaleLines(organizationId)}) sl2
    union all
    select c.variant_id from (${comingOf(organizationId)}) c
    union all
    select rp.variant_id from reorder_points rp
    where rp.organization_id = ${org}
  )`;
}

/**
 * What narrows the codes whatever the quick filters: their presence, one
 * item, its type, its category with every category under it, and the
 * search, the item as every search matches it (ADR-056) or one of its
 * lots on hand by its code, its supplier's lot (ADR-094, R6) or a former
 * code (amended, R10), at the place chosen when one is: the list keeps
 * what is there (20a). Every join names the organization (ADR-003).
 */
function codesWhere(query: StockFiltersDto, organizationId: string): SQL {
  const org = sql`${organizationId}::uuid`;
  const terms = query.search ? searchTerms(query.search) : null;

  return and(
    sql`${productVariants.organizationId} = ${org}`,
    presentOf(query, organizationId),
    query.productId
      ? sql`${products.id} = ${query.productId}::uuid`
      : undefined,
    query.type ? sql`${products.type} = ${query.type}` : undefined,
    query.categoryId
      ? inCategoryOrBelow(query.categoryId, organizationId)
      : undefined,
    terms
      ? or(
          itemMatches(terms, organizationId),
          sql`${productVariants.id} in (
            select sl.variant_id from stock_levels sl
            join lots lt
              on lt.id = sl.lot_id
              and lt.organization_id = ${org}
            where sl.organization_id = ${org}
              and sl.quantity > 0
              and ${lotMatches(
                {
                  id: sql`lt.id`,
                  code: sql`lt.code`,
                  supplierLot: sql`lt.supplier_lot`,
                },
                terms,
                organizationId,
              )}
              ${
                query.locationId
                  ? sql`and sl.location_id = ${query.locationId}::uuid`
                  : sql``
              }
          )`,
        )
      : undefined,
  )!;
}

/** A code and its item, as the outer query names them. */
function codesFrom(organizationId: string): SQL {
  return sql`${productVariants}
    join ${products}
      on ${products.id} = ${productVariants.productId}
      and ${products.organizationId} = ${organizationId}::uuid`;
}

/**
 * The quick filters read from stock rows, as the Lot view and Home's
 * Expiring soon read them (stockRowsOf): a code with stock, at the place
 * chosen, in a lot expiring within the days, the expired among it; in a
 * lot already expired; or waiting for a cost.
 */
function rowFilters(
  query: StockFiltersDto,
  organizationId: string,
  today: string,
  days: number | undefined,
  /** A page's codes alone, the rows statement's (review 40). */
  variants?: SQL,
) {
  return {
    expiring:
      days === undefined
        ? sql`false`
        : holdingLots(
            organizationId,
            sql`lt.expires_at <= ${today}::date + ${days}::int`,
            query.locationId,
          ),
    expired: holdingLots(
      organizationId,
      sql`lt.expires_at < ${today}::date`,
      query.locationId,
    ),
    // Waiting for a cost from the stock rows alone (review 39, again): as
    // a stock row's filter (stockRowsOf), without its joins to the item,
    // the place and the lot, which only it needs; a stock row's item and
    // place are always this organization's.
    needsCost: sql`${productVariants.id} in (
      select ${stockLevels.variantId}
      from ${stockLevels}
      where ${and(
        sql`${stockLevels.organizationId} = ${organizationId}::uuid`,
        sql`${stockLevels.quantity} > 0`,
        query.locationId
          ? sql`${stockLevels.locationId} = ${query.locationId}::uuid`
          : undefined,
        variants ? sql`${stockLevels.variantId} in ${variants}` : undefined,
        quickFiltersOf(organizationId, today, undefined, variants).needsCost,
      )}
    )`,
  };
}

/**
 * The codes holding a lot on hand whose expiry is in `range`, read from
 * the lots first (review 39): the organization's lots by
 * lots_org_expires_at_idx, then their stock, at the place chosen if one
 * is. A code's Expiring soon and Expired as a stock row's (stockRowsOf's
 * quick filters), so a count is the codes its filter shows; walked from
 * every stock row instead, each read 19,000 rows at the large volume to
 * keep a few hundred.
 */
function holdingLots(
  organizationId: string,
  range: SQL,
  locationId: string | undefined,
): SQL {
  const org = sql`${organizationId}::uuid`;

  return sql`${productVariants.id} in (
    select sl.variant_id
    from lots lt
    join stock_levels sl
      on sl.organization_id = ${org}
      and sl.variant_id = lt.variant_id
      and sl.lot_id = lt.id
      and sl.quantity > 0
      ${locationId ? sql`and sl.location_id = ${locationId}::uuid` : sql``}
    where lt.organization_id = ${org}
      and lt.expires_at is not null
      and ${range}
  )`;
}

/**
 * Each quick filter's count, the other filters asked kept on and its own
 * left off (ADR-093, R3; 30a): one select list, a "count(*) filter" for
 * each, named as its filter; and `total`, the rows the list shows, every
 * filter asked on, beside Show 50 more. A row per code's counts and the
 * Lot view's read it.
 */
function facetCounts<K extends string>(
  facets: Record<K, { on: SQL; asked: boolean }>,
): SQL {
  const names = Object.keys(facets) as K[];
  const asked = names
    .filter((name) => facets[name].asked)
    .map((name) => facets[name].on);
  return sql.join(
    [
      ...names.map(
        (counted) =>
          sql`(count(*) filter (where ${and(
            facets[counted].on,
            ...names
              .filter((other) => other !== counted && facets[other].asked)
              .map((other) => facets[other].on),
          )}))::int as ${sql.identifier(counted)}`,
      ),
      sql`(count(*) filter (where ${and(sql`true`, ...asked)}))::int as total`,
    ],
    sql`, `,
  );
}

/** The codes with a reorder point among those in `codes`, as `c`. */
function pointed(organizationId: string): SQL {
  return sql`(
    select c.variant_id from codes c
    where c.variant_id in (
      select rp.variant_id from reorder_points rp
      where rp.organization_id = ${organizationId}::uuid
    )
  )`;
}

/**
 * The CTEs `s` and `k` a list sorted by a figure reads (ADR-093, 29a),
 * after `codes`: the figure alone for every code kept, from codeFigures'
 * own parts (sortedFigure), or at the place chosen what is there
 * (hereOf); then `k`, a row per code with its figure as `value`, null
 * for a code with none, which the list reads as `c` as it reads `codes`. The codes and their figures are unioned and
 * grouped rather than joined, so however few codes the planner guesses,
 * it never reads the figures again for each.
 */
function sortedKeys(
  organizationId: string,
  today: string,
  sort: SortedFigure,
  here: string | undefined,
): SQL {
  const codes = sql`(select c.variant_id from codes c)`;
  const empty = sort === 'expires' ? sql`null::date` : sql`null::numeric`;
  const figure = sortedFigure(organizationId, today, codes, sort, here);

  return sql`
    s as materialized (${figure}),
    k as materialized (
      select kc.variant_id,
        ${sort === 'expires' ? sql`min(kc.value)` : sql`sum(kc.value)`} as value
      from (
        select c.variant_id, ${empty} as value from codes c
        union all
        select s.variant_id, s.value from s
      ) kc
      group by kc.variant_id
    )
  `;
}

/**
 * Each code's stock at one place (20a), for the items in `variants`:
 * on hand there, its lots there, and the soonest expiry of the usable
 * stock there, as a code's own expires first is the usable stock's.
 */
function hereOf(
  organizationId: string,
  today: string,
  locationId: string,
  variants: SQL,
): SQL {
  const org = sql`${organizationId}::uuid`;

  // On hand and Expires first by the figures' own rules, at this place
  // (.claude/rules/stock.md: never a sum of its own), each read once for
  // the codes, not again for each; its lots counted.
  return sql`
    with oh as materialized (
      ${onHandByItem(organizationId, variants, locationId)}
    ),
    ex as materialized (
      ${expiresFirstOf(organizationId, today, variants, locationId)}
    )
    select
      lt.variant_id,
      coalesce(oh.on_hand, 0) as on_hand,
      lt.lots,
      ex.expires_first
    from (
      select sl.variant_id,
        count(distinct sl.lot_id) filter (where sl.quantity > 0) as lots
      from stock_levels sl
      where sl.organization_id = ${org}
        and sl.location_id = ${locationId}::uuid
        and sl.variant_id in ${variants}
      group by sl.variant_id
    ) lt
    left join oh on oh.variant_id = lt.variant_id
    left join ex on ex.variant_id = lt.variant_id
  `;
}

/** A code's row as the rows statement reads it. */
type CodeRow = FigureRow & {
  variant_id: string;
  product_id: string;
  type: ProductType;
  cover_file_id: string | null;
  sku: string;
  product_name: string;
  variant_name: string | null;
  unit_of_measure: string;
  places: number;
  lots: number;
  needs_cost: boolean;
  stocked: boolean;
  tracks_lots: boolean;
  here_on_hand: string | null;
  here_lots: number | null;
  here_expires_first: string | null;
};

/** A pile as the places and the Lot view read it. */
type PileRow = {
  id: string;
  variant_id: string;
  product_id: string;
  type: ProductType;
  cover_file_id: string | null;
  sku: string;
  product_name: string;
  variant_name: string | null;
  unit_of_measure: string;
  location_id: string;
  location_name: string;
  location_code: string | null;
  is_available: boolean;
  lot_id: string | null;
  lot_code: string | null;
  lot_expires_at: string | null;
  lot_expiry: LotExpiry | null;
  lot_is_assigned: boolean | null;
  lot_supplier_lot: string | null;
  lot_former_code: string | null;
  quantity: string;
  emptied_at: Date | string | null;
  issued_to_run: IssuedRun | null;
  /** The places' read alone: on hand at the pile's place. */
  place_on_hand?: string;
};

/**
 * Inventory's grouped read (ADR-093, R1 to R4 and R16): a row per code,
 * fifty at a time, with its figures from the one read (code-figures.ts);
 * the counts beside its quick filters; a code's places and their lots as
 * its row opens; and the Lot view, a row per lot at each place. It
 * replaced the list of piles, `GET /v1/stock`, in the same branch (R22).
 *
 * A place's name goes only to a reader who may see places (ADR-080; A6).
 */
@Injectable()
export class StockGroupedService {
  constructor(private readonly tenantDb: TenantDb) {}

  /**
   * A page of codes, sorted by the item's name, the default, or by On
   * hand or Expires first (ADR-057, amended; Free is none, 35a), each
   * then by name, code and id; paged by the sort's values
   * (sorted-page.ts), since a figure is worked out, not kept. By name
   * with no Low stock or Out, only the page's codes are worked out; a
   * sort by a figure works out that figure alone for every code the other
   * filters keep (29a), and Low stock and Out the figures of the codes
   * with a point; then the page's codes in full. At one place, On hand
   * and Expires first sort by what is there, as the row shows it.
   *
   * Items named in the locale given, or by their base names for null, as
   * the CSV export reads them (ADR-056).
   */
  byCode(
    query: ListStockByCodeDto,
    locale: Locale | null,
  ): Promise<StockCodePage> {
    const limit = query.limit ?? PAGE_SIZE;
    const sort = query.sort ?? 'name';
    const way = query.order ?? 'asc';

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { today } = await openingOf(tx, organizationId, query);
      const org = sql`${organizationId}::uuid`;
      const here =
        query.locationId && (sort === 'onHand' || sort === 'expires')
          ? query.locationId
          : undefined;
      const status =
        query.out === 'true'
          ? sql`f.status = 'out'`
          : query.low === 'true'
            ? sql`f.status in ('low', 'out')`
            : undefined;

      const rows = rowFilters(
        query,
        organizationId,
        today,
        query.expiringWithin,
      );
      const name: KeyPart = {
        value: sql`(${
          locale
            ? productNameOrder(locale, organizationId)
            : sql`coalesce(${products.namePinyin}, search_text(${products.name}))`
        }) collate numeric_order`,
        type: 'text',
        order: 'asc',
      };
      const code: KeyPart = {
        value: sql`${productVariants.sku} collate numeric_order`,
        type: 'text',
        order: 'asc',
      };
      const id: KeyPart = {
        value: sql`${productVariants.id}`,
        type: 'uuid',
        order: 'asc',
      };
      const byKey: Record<typeof sort, KeyPart[]> = {
        name: [
          { ...name, order: way },
          { ...code, order: way },
          { ...id, order: way },
        ],
        onHand: [
          { value: sql`coalesce(c.value, 0)`, type: 'numeric', order: way },
          name,
          code,
          id,
        ],
        expires: [
          { value: sql`(c.value is null)::int`, type: 'int', order: 'asc' },
          {
            value: sql`coalesce(c.value - date '1970-01-01', 0)`,
            type: 'int',
            order: way,
          },
          name,
          code,
          id,
        ],
      };
      const parts = byKey[sort];
      const order = [sort, way, locale ?? 'base', here ? 'here' : 'all'].join(
        ' ',
      );

      const { rows: places } = await tx.execute<{
        id: string;
        keys: string[];
      }>(sql`
        with codes as materialized (
          select ${productVariants.id} as variant_id
          from ${codesFrom(organizationId)}
          where ${and(
            codesWhere(query, organizationId),
            query.expiringWithin !== undefined ? rows.expiring : undefined,
            query.expired === 'true' ? rows.expired : undefined,
            query.needsCost === 'true' ? rows.needsCost : undefined,
          )}
        )
        ${
          status
            ? sql`, f as materialized (${codeFigures(
                organizationId,
                today,
                pointed(organizationId),
                { expiresFirst: false },
              )})`
            : sql``
        }
        ${sort === 'name' ? sql`` : sql`, ${sortedKeys(organizationId, today, sort, here)}`}
        select
          ${productVariants.id} as id,
          array[${sql.join(
            parts.map((part) => sql`(${part.value})::text`),
            sql`, `,
          )}] as keys
        from ${sort === 'name' ? sql`codes c` : sql`k c`}
        join ${productVariants}
          on ${productVariants.id} = c.variant_id
          and ${productVariants.organizationId} = ${org}
        join ${products}
          on ${products.id} = ${productVariants.productId}
          and ${products.organizationId} = ${org}
        ${status ? sql`left join f on f.variant_id = c.variant_id` : sql``}
        where ${and(
          sql`true`,
          status,
          query.before
            ? afterKeys(parts, readKeys(query.before, order, parts))
            : undefined,
        )}
        order by ${sql.join(orderOf(parts), sql`, `)}
        limit ${limit + 1}
      `);

      const page = places.slice(0, limit);
      const last = page.at(-1);
      return {
        entries: await this.codesIn(
          tx,
          organizationId,
          today,
          locale,
          query.locationId,
          page.map((place) => place.id),
        ),
        nextCursor:
          places.length > limit && last ? cursorOf(order, last.keys) : null,
      };
    });
  }

  /**
   * The rows for a page's codes, in its order: each named for the reader,
   * its item, its places and lots, its figures from the one read, whether
   * any of it waits for a cost, and its figures at the place chosen.
   */
  private async codesIn(
    tx: Transaction,
    organizationId: string,
    today: string,
    locale: Locale | null,
    locationId: string | undefined,
    ids: string[],
  ): Promise<StockCodeRow[]> {
    if (ids.length === 0) return [];

    const org = sql`${organizationId}::uuid`;
    const variants = sql`(${sql.join(
      ids.map((id) => sql`${id}::uuid`),
      sql`, `,
    )})`;
    const shown = namesIn(locale, organizationId);
    const { needsCost } = rowFilters(
      {},
      organizationId,
      today,
      undefined,
      variants,
    );

    const { rows } = await tx.execute<CodeRow>(sql`
      with f as materialized (${codeFigures(organizationId, today, variants)}),
      pl as materialized (
        select
          sl.variant_id,
          count(distinct sl.location_id)::int as places,
          count(distinct sl.lot_id)::int as lots
        from stock_levels sl
        where sl.organization_id = ${org}
          and sl.variant_id in ${variants}
          and sl.quantity > 0
        group by sl.variant_id
      )
      ${
        locationId
          ? sql`, h as materialized (${hereOf(organizationId, today, locationId, variants)})`
          : sql``
      }
      select
        ${productVariants.id} as variant_id,
        ${products.id} as product_id,
        ${products.type} as type,
        ${coverOf()} as cover_file_id,
        ${productVariants.sku} as sku,
        ${shown.productName} as product_name,
        ${shown.variantName} as variant_name,
        ${productVariants.unitOfMeasure} as unit_of_measure,
        ${productVariants.tracksLots} as tracks_lots,
        coalesce(pl.places, 0) as places,
        coalesce(pl.lots, 0) as lots,
        ${figureColumns()},
        ${needsCost} as needs_cost,
        -- Ever stocked where the row stands, an emptied pile counted: an
        -- item never stocked here has nothing to correct (ADR-093 v3).
        exists (
          select 1 from ${stockLevels} ever
          where ever.organization_id = ${org}
            and ever.variant_id = ${productVariants.id}
            ${locationId ? sql`and ever.location_id = ${locationId}::uuid` : sql``}
        ) as stocked,
        ${
          locationId
            ? sql`${quantity(sql`coalesce(h.on_hand, 0)`)} as here_on_hand,
              coalesce(h.lots, 0)::int as here_lots,
              h.expires_first::text as here_expires_first`
            : sql`null as here_on_hand, null as here_lots,
              null as here_expires_first`
        }
      from ${codesFrom(organizationId)}
      join f on f.variant_id = ${productVariants.id}
      left join pl on pl.variant_id = ${productVariants.id}
      ${locationId ? sql`left join h on h.variant_id = ${productVariants.id}` : sql``}
      where ${productVariants.organizationId} = ${org}
        and ${productVariants.id} in ${variants}
    `);

    const byId = new Map(rows.map((row) => [row.variant_id, row]));
    return ids.map((id) => {
      const row = byId.get(id)!;
      return {
        variantId: row.variant_id,
        productId: row.product_id,
        type: row.type,
        coverFileId: row.cover_file_id,
        sku: row.sku,
        productName: row.product_name,
        variantName: row.variant_name,
        unitOfMeasure: row.unit_of_measure,
        places: row.places,
        lots: row.lots,
        ...figuresOf(row),
        needsCost: row.needs_cost,
        stocked: row.stocked,
        tracksLots: row.tracks_lots,
        here: locationId
          ? {
              onHand: row.here_on_hand!,
              lots: row.here_lots!,
              expiresFirst: row.here_expires_first,
            }
          : null,
      };
    });
  }

  /**
   * How many codes each quick filter shows (ADR-093, R3), with the other
   * filters on and its own off, as a faceted search counts, the five in
   * one statement. Expiring soon counts within the organization's warning
   * days unless asked otherwise (ADR-060), the expired among it, as Home's
   * late is among its tile (ADR-091); Low stock the out among it.
   */
  counts(query: StockFiltersDto): Promise<StockCodeCounts> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { today } = await openingOf(tx, organizationId, query);
      const days =
        query.expiringWithin ?? (await warningDays(tx, organizationId));
      const rows = rowFilters(query, organizationId, today, days);

      const facets: Record<
        Exclude<keyof StockCodeCounts, 'total'>,
        { asked: boolean; on: SQL }
      > = {
        low: {
          asked: query.low === 'true',
          on: sql`f.status in ('low', 'out')`,
        },
        out: { asked: query.out === 'true', on: sql`f.status = 'out'` },
        expiring: {
          asked: query.expiringWithin !== undefined,
          on: sql`c.expiring`,
        },
        expired: { asked: query.expired === 'true', on: sql`c.expired` },
        needsCost: {
          asked: query.needsCost === 'true',
          on: sql`c.needs_cost`,
        },
      };

      const {
        rows: [counts],
      } = await tx.execute<Record<keyof StockCodeCounts, number>>(sql`
        with codes as materialized (
          select
            ${productVariants.id} as variant_id,
            ${rows.expiring} as expiring,
            ${rows.expired} as expired,
            ${rows.needsCost} as needs_cost
          from ${codesFrom(organizationId)}
          where ${codesWhere(query, organizationId)}
        ),
        f as materialized (${codeFigures(
          organizationId,
          today,
          pointed(organizationId),
          { expiresFirst: false },
        )})
        select ${facetCounts(facets)}
        from codes c
        left join f on f.variant_id = c.variant_id
      `);
      return counts;
    });
  }

  /**
   * A code's places and each place's lots (ADR-093, R2), as its row opens:
   * the places by name, the lots soonest first, one with no expiry after
   * those with one, each a pile the row's menu, Move, Edit lot and History
   * read. At the place chosen alone; emptied piles with Include empty.
   */
  places(
    variantId: string,
    query: StockPlacesDto,
    locale: Locale | null,
    seesPlaces: boolean,
  ): Promise<StockCodePlaces> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const [known] = await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(
          and(
            eq(productVariants.organizationId, organizationId),
            eq(productVariants.id, variantId),
          ),
        );
      if (!known) {
        throw new NotFoundException(
          t({ id: 'stock.suchItem', defaultMessage: 'No such item' }),
        );
      }

      const places = await placesOf(
        tx,
        organizationId,
        locale,
        sql`(${variantId}::uuid)`,
        query,
        seesPlaces,
      );
      return { places: places.get(variantId) ?? [] };
    });
  }

  /**
   * The Lot view (ADR-093, R4; 25a): a row per lot at each place, from
   * the rows Home's Expiring soon counts (stockRowsOf), so the tile's
   * count is its list's rows. Soonest first, the expired on top, a lot
   * with no expiry last; then by the lot's code and the place, so a lot's
   * places sit together, each row saying how many there are. Its headers
   * sort it by the item, the place or the quantity instead, either way,
   * the same lot's code and place breaking ties (Bob's third message, 7).
   * The same filters as a row per code; paged by a pile's id, its place
   * in the order read back under the sort asked, since nothing in it is
   * worked out.
   */
  byLot(
    query: ListStockByLotDto,
    locale: Locale | null,
    seesPlaces: boolean,
  ): Promise<StockLotPage> {
    const limit = query.limit ?? PAGE_SIZE;

    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { timeZone, today } = await openingOf(tx, organizationId, query);
      const org = sql`${organizationId}::uuid`;
      const parts = lotKeys(
        query.sort ?? 'expires',
        query.order ?? 'asc',
        locale,
        organizationId,
      );

      let after: SQL | undefined;
      if (query.before) {
        // The cursor pile's keys under the sort asked, read through the
        // same joins as the list's rows, a lot's alone.
        const {
          rows: [cursor],
        } = await tx.execute<{ keys: string[] }>(sql`
          select array[${sql.join(
            parts.map((part) => sql`(${part.value})::text`),
            sql`, `,
          )}] as keys
          from ${stockRowsOf({ includeEmpty: 'true' }, organizationId, today)}
            and ${stockLevels.lotId} is not null
            and ${stockLevels.id} = ${query.before}::uuid
        `);
        // Another organization's pile, one with no lot, or none: no place
        // in this list.
        if (!cursor) throw notInThisList();
        after = afterKeys(parts, cursor.keys);
      }

      const {
        rows: from,
        facets,
        asked,
      } = lotFilters(query, organizationId, today, query.expiringWithin);

      // The page's piles found by their keys first, then their columns
      // (names, the cover) worked out for those alone (review 44): built
      // for every pile the filters keep, the cover was looked up 11,323
      // times at the large volume to show 50.
      const { rows } = await tx.execute<PileRow>(sql`
        with k as materialized (
          select ${stockLevels.id} as id
          from ${from}
          and ${and(
            sql`true`,
            ...LOT_FACETS.filter((facet) => asked[facet]).map(
              (facet) => facets[facet],
            ),
            after,
          )}
          order by ${sql.join(orderOf(parts), sql`, `)}
          limit ${limit + 1}
        )
        select ${pileColumns(organizationId, locale)}
        from ${stockRowsOf({ includeEmpty: 'true' }, organizationId, today)}
        and ${stockLevels.id} in (select k.id from k)
        order by ${sql.join(orderOf(parts), sql`, `)}
      `);

      const page = pageOf(rows, limit);
      const lotIds = page.entries.map((row) => row.lot_id!);
      const { rows: spread } = lotIds.length
        ? await tx.execute<{ lot_id: string; places: number }>(sql`
            select sl.lot_id, count(*)::int as places
            from stock_levels sl
            where sl.organization_id = ${org}
              and sl.lot_id in (${sql.join(
                lotIds.map((lotId) => sql`${lotId}::uuid`),
                sql`, `,
              )})
              and sl.quantity > 0
            group by sl.lot_id
          `)
        : { rows: [] as { lot_id: string; places: number }[] };
      const placesOf = new Map(
        spread.map((row): [string, number] => [row.lot_id, row.places]),
      );
      const pathOf = seesPlaces
        ? await pathsOf(
            tx,
            organizationId,
            page.entries.map((row) => row.location_id),
          )
        : new Map<string, string[]>();

      return {
        entries: page.entries.map((row) => ({
          ...pileOf(row, seesPlaces, timeZone),
          productId: row.product_id,
          type: row.type,
          coverFileId: row.cover_file_id,
          locationPath: pathOf.get(row.location_id) ?? [],
          isAvailable: row.is_available,
          places: placesOf.get(row.lot_id!) ?? 0,
        })),
        nextCursor: page.nextCursor,
      };
    });
  }

  /**
   * How many rows each of the Lot view's quick filters shows (ADR-093, R3;
   * 30a), with the other filters on and its own off, the five in one
   * statement: lots at each place, as its rows are, never codes. Expiring
   * soon within the organization's warning days unless asked otherwise,
   * the expired among it; Details to add its own (ADR-094, R9). No Out: a
   * code that is out keeps no lot to list (31a).
   */
  lotCounts(query: StockLotFiltersDto): Promise<StockLotCounts> {
    return this.tenantDb.transaction(async (tx, organizationId) => {
      const { today } = await openingOf(tx, organizationId, query);
      const days =
        query.expiringWithin ?? (await warningDays(tx, organizationId));
      const {
        rows: from,
        facets,
        asked,
      } = lotFilters(query, organizationId, today, days);

      const {
        rows: [counts],
      } = await tx.execute<Record<keyof StockLotCounts, number>>(sql`
        with r as materialized (
          select ${sql.join(
            LOT_FACETS.map(
              (facet) => sql`(${facets[facet]}) as ${sql.identifier(facet)}`,
            ),
            sql`, `,
          )}
          from ${from}
        )
        select ${facetCounts(
          Object.fromEntries(
            LOT_FACETS.map((facet) => [
              facet,
              { on: sql`r.${sql.identifier(facet)}`, asked: asked[facet] },
            ]),
          ) as Record<LotFacet, { on: SQL; asked: boolean }>,
        )}
        from r
      `);
      return counts;
    });
  }
}

/**
 * The Lot view's order as key parts (Bob's third message, 7): the sort
 * asked first, each way, then the lot's code and id, the place and the
 * pile, so a lot's places sit together and every pile has one place. A
 * lot with no expiry is last either way; the item by its name in the
 * reader's language, as a row per code sorts it, then its code.
 */
function lotKeys(
  sort: StockLotSort,
  way: SortOrder,
  locale: Locale | null,
  organizationId: string,
): KeyPart[] {
  const name: KeyPart = {
    value: sql`(${
      locale
        ? productNameOrder(locale, organizationId)
        : sql`coalesce(${products.namePinyin}, search_text(${products.name}))`
    }) collate numeric_order`,
    type: 'text',
    order: 'asc',
  };
  const code: KeyPart = {
    value: sql`${productVariants.sku} collate numeric_order`,
    type: 'text',
    order: 'asc',
  };
  const tail: KeyPart[] = [
    { value: sql`${lots.code}`, type: 'text', order: 'asc' },
    { value: sql`${lots.id}`, type: 'uuid', order: 'asc' },
    { value: sql`${locations.name}`, type: 'text', order: 'asc' },
    { value: sql`${stockLevels.id}`, type: 'uuid', order: 'asc' },
  ];
  const expires: KeyPart[] = [
    { value: sql`(${lots.expiresAt} is null)::int`, type: 'int', order: 'asc' },
    {
      value: sql`coalesce(${lots.expiresAt} - date '1970-01-01', 0)`,
      type: 'int',
      order: way,
    },
  ];

  switch (sort) {
    case 'item':
      return [{ ...name, order: way }, { ...code, order: way }, ...tail];
    case 'location':
      return [
        {
          value: sql`${locations.name} collate numeric_order`,
          type: 'text',
          order: way,
        },
        name,
        code,
        ...tail,
      ];
    case 'quantity':
      return [
        { value: sql`${stockLevels.quantity}`, type: 'numeric', order: way },
        name,
        code,
        ...tail,
      ];
    default:
      return [...expires, ...tail];
  }
}

/** The Lot view's quick filters, each counted beside its button (30a). */
const LOT_FACETS = [
  'low',
  'expiring',
  'expired',
  'needsCost',
  'detailsToAdd',
] as const;
type LotFacet = (typeof LOT_FACETS)[number];

/**
 * Details to add (ADR-094, R9; E5), on the joined lot: one whose expiry
 * is not known yet, "Expiry to add", or one whose code was made here
 * and whose supplier's lot is still to add, "Supplier's lot to add". The
 * two marks a lot reads until it is filled, in one filter, so every
 * unfinished lot is in one place.
 */
const DETAILS_TO_ADD = sql`(
  ${lots.expiry} = 'unknown'
  or (${lots.isAssigned} and ${lots.supplierLot} is null)
)`;

/**
 * The Lot view's filters (ADR-093, R3 and R4; 30a), one builder for its
 * rows, its counts and so its export. `rows` is stockRowsOf's FROM and
 * WHERE, Home's Expiring soon's rows, under the filters every count keeps:
 * a lot's rows alone, the item, its type and category, one place, the
 * search, Include empty, and Out, by the code's status. `facets` is each
 * quick filter's condition on them, `asked` the ones the reader chose:
 * Low stock by the code's status, the out among it, as Reorder counts it;
 * Expiring soon, Expired and Waiting for a cost by the row's own lot, as
 * the list of stock rows reads them (quickFiltersOf); Details to add by
 * the row's lot too (ADR-094).
 */
function lotFilters(
  query: StockLotFiltersDto,
  organizationId: string,
  today: string,
  days: number | undefined,
): {
  rows: SQL;
  facets: Record<LotFacet, SQL>;
  asked: Record<LotFacet, boolean>;
} {
  const quick = quickFiltersOf(organizationId, today, days);
  const pointedCodes = sql`(
    select rp.variant_id from reorder_points rp
    where rp.organization_id = ${organizationId}::uuid
  )`;
  const statusIn = (statuses: SQL) => sql`${stockLevels.variantId} in (
    select f.variant_id
    from (${codeFigures(organizationId, today, pointedCodes)}) f
    where f.status in (${statuses})
  )`;

  return {
    rows: sql`${stockRowsOf(
      {
        locationId: query.locationId,
        productId: query.productId,
        includeEmpty: query.includeEmpty,
        search: query.search,
      },
      organizationId,
      today,
    )}
    and ${and(
      sql`${stockLevels.lotId} is not null`,
      query.type ? sql`${products.type} = ${query.type}` : undefined,
      query.categoryId
        ? inCategoryOrBelow(query.categoryId, organizationId)
        : undefined,
      query.out === 'true' ? statusIn(sql`'out'`) : undefined,
    )}`,
    facets: {
      low: statusIn(sql`'low', 'out'`),
      expiring: quick.expiring ?? sql`false`,
      expired: quick.expired,
      needsCost: quick.needsCost,
      detailsToAdd: DETAILS_TO_ADD,
    },
    asked: {
      low: query.low === 'true',
      expiring: query.expiringWithin !== undefined,
      expired: query.expired === 'true',
      needsCost: query.needsCost === 'true',
      detailsToAdd: query.detailsToAdd === 'true',
    },
  };
}

/**
 * Each code's places and each place's lots (ADR-093, R2), for the items
 * in `variants`, a parenthesised list or subquery of ids: the places by
 * name, the lots soonest first, one with no expiry after those with one,
 * each a pile the row's menu, Move, Edit lot and History read. At the
 * place chosen alone; emptied piles with Include empty, but for a code
 * that tracks lots its emptied pile with no lot, the stock from before
 * its tracking started, which is all in a lot now (ADR-094).
 * Inventory's opened row and Where it stands read it alike; a place's
 * name only for a reader who may see places (A6).
 */
export async function placesOf(
  tx: Transaction,
  organizationId: string,
  locale: Locale | null,
  variants: SQL,
  query: StockPlacesDto,
  seesPlaces: boolean,
): Promise<Map<string, StockPlace[]>> {
  const org = sql`${organizationId}::uuid`;
  const timeZone = await timeZoneOf(tx, organizationId);
  const { rows } = await tx.execute<PileRow>(sql`
    select
      ${pileColumns(organizationId, locale)},
      ${quantity(
        sql`sum(${stockLevels.quantity}) over (
          partition by ${stockLevels.variantId}, ${stockLevels.locationId}
        )`,
      )} as place_on_hand
    from ${stockLevels}
    join ${productVariants}
      on ${productVariants.id} = ${stockLevels.variantId}
      and ${productVariants.organizationId} = ${org}
    join ${products}
      on ${products.id} = ${productVariants.productId}
      and ${products.organizationId} = ${org}
    join ${locations}
      on ${locations.id} = ${stockLevels.locationId}
      and ${locations.organizationId} = ${org}
    left join ${lots}
      on ${lots.id} = ${stockLevels.lotId}
      and ${lots.organizationId} = ${org}
    where ${and(
      sql`${stockLevels.organizationId} = ${org}`,
      sql`${stockLevels.variantId} in ${variants}`,
      query.locationId
        ? sql`${stockLevels.locationId} = ${query.locationId}::uuid`
        : undefined,
      keptPiles(query.includeEmpty === 'true', {
        quantity: sql`${stockLevels.quantity}`,
        lotId: sql`${stockLevels.lotId}`,
        tracksLots: sql`${productVariants.tracksLots}`,
      }),
    )}
    order by ${stockLevels.variantId}, ${locations.name}, ${locations.id},
      ${lots.expiresAt} asc nulls last, ${lots.code}, ${stockLevels.id}
  `);

  const pathOf = seesPlaces
    ? await pathsOf(
        tx,
        organizationId,
        rows.map((row) => row.location_id),
      )
    : new Map<string, string[]>();

  const placed = new Map<string, StockPlace[]>();
  for (const row of rows) {
    const places = placed.get(row.variant_id) ?? [];
    placed.set(row.variant_id, places);
    let place = places.at(-1);
    if (place?.locationId !== row.location_id) {
      place = {
        locationId: row.location_id,
        locationName: seesPlaces ? row.location_name : null,
        locationCode: seesPlaces ? row.location_code : null,
        locationPath: pathOf.get(row.location_id) ?? [],
        isAvailable: row.is_available,
        onHand: row.place_on_hand!,
        lots: [],
      };
      places.push(place);
    }
    place.lots.push(pileOf(row, seesPlaces, timeZone));
  }
  return placed;
}

/** The organization's warning days, Expiring soon's (ADR-060). */
async function warningDays(
  tx: Transaction,
  organizationId: string,
): Promise<number> {
  const [organization] = await tx
    .select({ days: organizations.expiryWarningDays })
    .from(organizations)
    .where(eq(organizations.id, organizationId));
  return organization.days;
}

/**
 * A pile's columns: its item, named for the reader, its place and its
 * lot, over stock_levels, product_variants, products, locations and lots
 * by their tables, as the places and the Lot view join them.
 */
function pileColumns(organizationId: string, locale: Locale | null): SQL {
  const shown = namesIn(locale, organizationId);

  return sql`
    ${stockLevels.id} as id,
    ${stockLevels.variantId} as variant_id,
    ${products.id} as product_id,
    ${products.type} as type,
    ${coverOf()} as cover_file_id,
    ${productVariants.sku} as sku,
    ${shown.productName} as product_name,
    ${shown.variantName} as variant_name,
    ${productVariants.unitOfMeasure} as unit_of_measure,
    ${stockLevels.locationId} as location_id,
    ${locations.name} as location_name,
    ${locations.code} as location_code,
    ${locations.isAvailable} as is_available,
    ${stockLevels.lotId} as lot_id,
    ${lots.code} as lot_code,
    ${lots.expiresAt}::text as lot_expires_at,
    ${lots.expiry} as lot_expiry,
    ${lots.isAssigned} as lot_is_assigned,
    ${lots.supplierLot} as lot_supplier_lot,
    -- "was {code}" under the code (ADR-094 amended, R9), for the page's
    -- piles alone.
    ${latestFormerCode(sql`${stockLevels.lotId}`, organizationId)} as lot_former_code,
    ${quantity(sql`${stockLevels.quantity}`)} as quantity,
    -- An emptied pile's last change, the one that left none; its day is
    -- the organization's, worked out by dayIn (ADR-072).
    case when ${stockLevels.quantity} = 0
      then ${stockLevels.updatedAt} end as emptied_at,
    -- The open run its lot was issued to here, whose close takes it
    -- (review 73): Move to another lot is greyed for it.
    case when ${stockLevels.lotId} is not null then (
      select json_build_object(
        'id', r.id,
        'reference', r.reference,
        'quantityPlanned', r.quantity_planned
      )
      from (${openRunIssued(organizationId, {
        variantId: sql`${stockLevels.variantId}`,
        locationId: sql`${stockLevels.locationId}`,
        lotId: sql`${stockLevels.lotId}`,
        lotNote: sql`${lots.note}`,
      })}) r
    ) end as issued_to_run
  `;
}

/** A pile as the API sends it, its place's name for a reader who may see it. */
function pileOf(row: PileRow, seesPlaces: boolean, timeZone: string) {
  return {
    id: row.id,
    variantId: row.variant_id,
    sku: row.sku,
    productName: row.product_name,
    variantName: row.variant_name,
    unitOfMeasure: row.unit_of_measure,
    locationId: row.location_id,
    locationName: seesPlaces ? row.location_name : null,
    locationCode: seesPlaces ? row.location_code : null,
    lotId: row.lot_id,
    lotCode: row.lot_code,
    lotExpiresAt: row.lot_expires_at,
    lotExpiry: row.lot_expiry,
    lotIsAssigned: row.lot_is_assigned,
    lotSupplierLot: row.lot_supplier_lot,
    lotFormerCode: row.lot_former_code,
    quantity: row.quantity,
    emptiedOn: row.emptied_at ? dayIn(timeZone, row.emptied_at) : null,
    issuedToRun: row.issued_to_run,
  };
}

/**
 * Each of Stock's reads opens the same way (#624): the address's item the
 * organization's own, else refused as unknown before anything is read,
 * then the organization's time zone and its today, in the read's own
 * transaction.
 */
async function openingOf(
  tx: Transaction,
  organizationId: string,
  query: { productId?: string },
): Promise<{ timeZone: string; today: string }> {
  await assertOwnIds(
    tx,
    products,
    organizationId,
    [query.productId],
    UNKNOWN_ITEM,
  );
  const timeZone = await timeZoneOf(tx, organizationId);
  return { timeZone, today: todayIn(timeZone) };
}
