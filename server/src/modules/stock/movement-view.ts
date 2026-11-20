import {
  and,
  eq,
  inArray,
  lt,
  or,
  type SQL,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { instantRange } from '../../common/date-range';
import { type KeysetPage, pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { notInThisList } from '../../common/sorted-page';
import {
  locations,
  lots,
  products,
  type ProductType,
  productVariants,
  stockMovements,
  users,
} from '../../database/schema';
import type { ListMovementsDto } from './dto/list-movements.dto';
import type {
  Movement,
  MovementDocument,
  RecordedMovement,
} from './dto/stock-response.dto';
import { namesIn } from './item-name';
import { pathsOf } from './place-paths';
import type { Tx } from './stock.service';

/**
 * A movement just recorded, as the API returns it (ADR-068): the ledger's
 * own fields, without the organization or the actor's id. Shared by every
 * route that records one, so a movement has one shape.
 */
export function movementOf(
  row: typeof stockMovements.$inferSelect,
): RecordedMovement {
  return {
    id: row.id,
    variantId: row.variantId,
    sku: row.sku,
    lotId: row.lotId,
    fromLocationId: row.fromLocationId,
    toLocationId: row.toLocationId,
    quantity: row.quantity,
    reason: row.reason,
    reasonDetail: row.reasonDetail,
    referenceType: row.referenceType,
    referenceId: row.referenceId,
    note: row.note,
    createdAt: row.createdAt,
  };
}

/**
 * What a reader may see of a movement beyond the ledger's own fields, each
 * by its view permission (ADR-080), as Where it stands reads them.
 */
export interface MovementSight {
  /**
   * `locations.view`: each end's name, code and path; its id is sent to
   * every reader, as Stock's rows keep theirs (ADR-093, 96a).
   */
  places: boolean;
  /** `orders.view`: the order a movement was received, shipped or returned on (55a). */
  orders: boolean;
  /** `production.view`: the run it was issued to or made by (55a). */
  runs: boolean;
}

/**
 * One page of the ledger as the one movement row (ADR-093, R9 and R20),
 * which Movements, the item's page and the export read: the item by
 * today's name, code and type, the code it was recorded under, its unit;
 * the lot with its expiry; each end with its path; who, when, and the
 * document it was for, each part only for a reader who may see it.
 *
 * Newest first, by when each was recorded and then by id, paged by
 * keyset (afterCursor): offset paging would shift every page down as rows
 * arrive at the head, which an append-only ledger does all day.
 *
 * The page is taken first, from the ledger alone, and only its rows are
 * joined: one shelf's movements come from the from and the to place's
 * indexes in no order, so joined first, every one of them was joined,
 * each organization's lots read whole, before the newest were kept
 * (ADR-051's watch). Left joins throughout: a movement with no source is
 * inbound, a lot is null for untracked variants, and an actor may be a
 * tombstone (ADR-012); an inner join would drop exactly the rows the
 * RESTRICT constraints exist to preserve. Two of them are the same table
 * aliased, because a transfer names both a source and a destination.
 *
 * The item's names, today's code, its type and unit, each end's path and
 * the document are read for the page's rows alone, once it is taken
 * (ADR-056; 57a; 55a). Joined before, the names were worked out for every
 * movement a filter matched, a scan of every variant for one shelf at
 * ADR-051's large scale. The recorded SKU is the row's own snapshot
 * (ADR-023), so a changed code does not rewrite history.
 */
export async function movementPage(
  tx: Tx,
  organizationId: string,
  query: ListMovementsDto,
  locale: Locale | null,
  sight: MovementSight,
): Promise<KeysetPage<Movement>> {
  const limit = query.limit ?? 50;
  const from = alias(locations, 'from_location');
  const to = alias(locations, 'to_location');

  const filters = [
    eq(stockMovements.organizationId, organizationId),
    query.before
      ? await afterCursor(tx, organizationId, query.before)
      : undefined,
    query.variantId ? eq(stockMovements.variantId, query.variantId) : undefined,
    query.lotId ? eq(stockMovements.lotId, query.lotId) : undefined,
    query.locationId
      ? or(
          eq(stockMovements.fromLocationId, query.locationId),
          eq(stockMovements.toLocationId, query.locationId),
        )
      : undefined,
    query.orderId ? ofOrder(organizationId, query.orderId) : undefined,
    query.reason ? eq(stockMovements.reason, query.reason) : undefined,
    ...instantRange(stockMovements.createdAt, query),
  ].filter((filter): filter is SQL => filter !== undefined);

  // One more than asked for, so the presence of a next page is known
  // without a second count query.
  const movement = tx
    .select({
      id: stockMovements.id,
      variantId: stockMovements.variantId,
      sku: stockMovements.sku,
      quantity: stockMovements.quantity,
      reason: stockMovements.reason,
      reasonDetail: stockMovements.reasonDetail,
      note: stockMovements.note,
      fromLocationId: stockMovements.fromLocationId,
      toLocationId: stockMovements.toLocationId,
      lotId: stockMovements.lotId,
      actorId: stockMovements.actorId,
      createdAt: stockMovements.createdAt,
    })
    .from(stockMovements)
    .where(and(...filters))
    .orderBy(...newestFirst(stockMovements.createdAt, stockMovements.id))
    .limit(limit + 1)
    .as('movement');

  const rows = await tx
    .select({
      id: movement.id,
      variantId: movement.variantId,
      sku: movement.sku,
      quantity: movement.quantity,
      reason: movement.reason,
      reasonDetail: movement.reasonDetail,
      note: movement.note,
      fromLocationId: movement.fromLocationId,
      fromLocationName: from.name,
      fromLocationCode: from.code,
      toLocationId: movement.toLocationId,
      toLocationName: to.name,
      toLocationCode: to.code,
      lotId: movement.lotId,
      lotCode: lots.code,
      lotExpiresAt: lots.expiresAt,
      // Who, by name with their email (ADR-063). An anonymised account
      // keeps its row and its name, Deleted User, and its address is a
      // placeholder, which no one should read as theirs (ADR-012).
      actorName: users.name,
      actorEmail: sql<
        string | null
      >`case when ${users.deletedAt} is null then ${users.email} end`,
      createdAt: movement.createdAt,
    })
    .from(movement)
    .leftJoin(from, eq(from.id, movement.fromLocationId))
    .leftJoin(to, eq(to.id, movement.toLocationId))
    .leftJoin(lots, eq(lots.id, movement.lotId))
    .leftJoin(users, eq(users.id, movement.actorId))
    .orderBy(...newestFirst(movement.createdAt, movement.id));

  const page = pageOf(rows, limit);
  const items = await itemsOf(
    tx,
    organizationId,
    page.entries.map((row) => row.variantId),
    locale,
  );
  // The places above each end, its warehouse first (57a), only for a
  // reader who may see places, as Stock's reads send them.
  const pathOf = sight.places
    ? await pathsOf(
        tx,
        organizationId,
        page.entries.flatMap((row) =>
          [row.fromLocationId, row.toLocationId].filter(
            (id): id is string => id !== null,
          ),
        ),
      )
    : new Map<string, string[]>();
  const pathTo = (placeId: string | null) =>
    (placeId && pathOf.get(placeId)) || [];
  const documents = await documentsOf(
    tx,
    organizationId,
    page.entries.map((row) => row.id),
    sight,
  );

  return {
    nextCursor: page.nextCursor,
    entries: page.entries.map((row) => {
      const item = items.get(row.variantId)!;
      return {
        id: row.id,
        variantId: row.variantId,
        productId: item.productId,
        sku: row.sku,
        currentSku: item.sku,
        productName: item.productName,
        variantName: item.variantName,
        type: item.type,
        unitOfMeasure: item.unitOfMeasure,
        quantity: row.quantity,
        reason: row.reason,
        reasonDetail: row.reasonDetail,
        note: row.note,
        fromLocationId: row.fromLocationId,
        fromLocationName: sight.places ? row.fromLocationName : null,
        fromLocationCode: sight.places ? row.fromLocationCode : null,
        fromLocationPath: pathTo(row.fromLocationId),
        toLocationId: row.toLocationId,
        toLocationName: sight.places ? row.toLocationName : null,
        toLocationCode: sight.places ? row.toLocationCode : null,
        toLocationPath: pathTo(row.toLocationId),
        lotId: row.lotId,
        lotCode: row.lotCode,
        lotExpiresAt: row.lotExpiresAt,
        actorName: row.actorName,
        actorEmail: row.actorEmail,
        createdAt: row.createdAt,
        document: documents.get(row.id) ?? null,
      };
    }),
  };
}

/**
 * Newest first: when recorded, nulls last as the indexes on the time are
 * built (`.desc()`), then the id. created_at is never null, but Postgres
 * reads an index in a query's order only when its nulls come where the
 * index keeps them: ordered nulls first, as `desc` alone is, the first page
 * at ADR-051's large scale sorted every movement of the organization, 83
 * ms, where it now reads 51 rows from the index, 0.3 ms.
 */
function newestFirst(createdAt: SQLWrapper, id: SQLWrapper): SQL[] {
  return [sql`${createdAt} desc nulls last`, sql`${id} desc`];
}

/**
 * The movements after the cursor's, newest first by when each was
 * recorded and then by id (ADR-093). The id alone does not say when: it
 * is made as each row is written, the time when the row's transaction
 * began, so of two transactions at once the one that began later can
 * write the earlier id. Movements recorded together, as a shipment from
 * two lots, share one time, and the id keeps them in one order on every
 * page.
 *
 * The cursor stays the last row's id, as every list sends it (ADR-018);
 * its time is read back as text, keeping its microseconds, in this
 * organization, and a cursor that is no movement here is refused, 400.
 * The time bounds the condition on its own, `created_at <= t`, so an index
 * on the time starts at the cursor, rather than at the newest movement,
 * reading every one between.
 */
async function afterCursor(
  tx: Tx,
  organizationId: string,
  before: string,
): Promise<SQL> {
  const [cursor] = await tx
    .select({ createdAt: sql<string>`${stockMovements.createdAt}::text` })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, organizationId),
        eq(stockMovements.id, before),
      ),
    );
  if (!cursor) throw notInThisList();

  const at = sql`${cursor.createdAt}::timestamptz`;
  return sql`(${stockMovements.createdAt} <= ${at}
    and (${stockMovements.createdAt} < ${at} or ${lt(stockMovements.id, before)}))`;
}

/**
 * An order's movements (ADR-093, R24): what was received on it, shipped
 * on it by its shipments (their voids among them, which reference the
 * shipment they undo, ADR-041) and returned on it by its returns, as
 * documentsOf names each movement's order. Each arm by the movements'
 * reference index; the shipments and returns are read first, each an
 * array the arm matches, so the three arms are one bitmap OR rather than
 * a subquery tried on every movement.
 */
function ofOrder(organizationId: string, orderId: string): SQL {
  const org = sql`${organizationId}::uuid`;
  const order = sql`${orderId}::uuid`;
  return sql`(
    (${stockMovements.referenceType} = 'purchase_order'
      and ${stockMovements.referenceId} = ${order})
    or (${stockMovements.referenceType} = 'shipment'
      and ${stockMovements.referenceId} = any(array(
        select sh.id from shipments sh
        where sh.organization_id = ${org} and sh.order_id = ${order}
      )))
    or (${stockMovements.referenceType} = 'order_return'
      and ${stockMovements.referenceId} = any(array(
        select rt.id from order_returns rt
        where rt.organization_id = ${org} and rt.order_id = ${order}
      )))
  )`;
}

/**
 * The document each movement was for, by the movement's id (55a), for the
 * page's alone: a purchase order received on, a sale shipped on (by its
 * shipment) or returned on (by its return), or a run. An order only for
 * a reader with orders.view, a run with production.view. Every join names
 * the organization (ADR-003).
 */
async function documentsOf(
  tx: Tx,
  organizationId: string,
  movementIds: string[],
  sight: MovementSight,
): Promise<Map<string, MovementDocument>> {
  if (movementIds.length === 0 || (!sight.orders && !sight.runs)) {
    return new Map();
  }
  const org = sql`${organizationId}::uuid`;
  const { rows } = await tx.execute<{
    id: string;
    order_id: string | null;
    order_number: string | null;
    run_id: string | null;
    run_reference: string | null;
  }>(sql`
    select m.id,
      coalesce(po.id, so.id, ro.id) as order_id,
      coalesce(po.number, so.number, ro.number) as order_number,
      run.id as run_id,
      run.reference as run_reference
    from stock_movements m
    left join orders po
      on m.reference_type = 'purchase_order'
      and po.id = m.reference_id
      and po.organization_id = ${org}
    left join shipments sh
      on m.reference_type = 'shipment'
      and sh.id = m.reference_id
      and sh.organization_id = ${org}
    left join orders so
      on so.id = sh.order_id
      and so.organization_id = ${org}
    left join order_returns rt
      on m.reference_type = 'order_return'
      and rt.id = m.reference_id
      and rt.organization_id = ${org}
    left join orders ro
      on ro.id = rt.order_id
      and ro.organization_id = ${org}
    left join production_orders run
      on m.reference_type = 'production_order'
      and run.id = m.reference_id
      and run.organization_id = ${org}
    where m.organization_id = ${org}
      and m.id in (${sql.join(
        movementIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      )})
  `);

  const documents = new Map<string, MovementDocument>();
  for (const row of rows) {
    if (sight.orders && row.order_id) {
      documents.set(row.id, {
        kind: 'order',
        id: row.order_id,
        number: row.order_number,
      });
    } else if (sight.runs && row.run_id) {
      documents.set(row.id, {
        kind: 'run',
        id: row.run_id,
        number: row.run_reference,
      });
    }
  }
  return documents;
}

/** An item as a movement's row names it, today. */
interface ItemToday {
  productId: string;
  sku: string;
  productName: string;
  variantName: string | null;
  type: ProductType;
  unitOfMeasure: string;
}

/**
 * The page's items by the code's id, as they are today: the names, in the
 * locale given or the base names for null (ADR-056), the code (7a), the
 * type and the unit, for the few a page shows.
 */
async function itemsOf(
  tx: Tx,
  organizationId: string,
  variantIds: string[],
  locale: Locale | null,
): Promise<Map<string, ItemToday>> {
  if (variantIds.length === 0) return new Map();

  const shown = namesIn(locale, organizationId);
  const rows = await tx
    .select({
      id: productVariants.id,
      productId: products.id,
      sku: productVariants.sku,
      productName: shown.productName,
      variantName: shown.variantName,
      type: sql<ProductType>`${products.type}`,
      unitOfMeasure: productVariants.unitOfMeasure,
    })
    .from(productVariants)
    .innerJoin(
      products,
      and(
        eq(products.id, productVariants.productId),
        eq(products.organizationId, organizationId),
      ),
    )
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        inArray(productVariants.id, [...new Set(variantIds)]),
      ),
    );

  return new Map(rows.map(({ id, ...item }) => [id, item]));
}
