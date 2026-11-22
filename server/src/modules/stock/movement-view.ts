import {
  and,
  eq,
  gt,
  gte,
  inArray,
  lt,
  or,
  type SQL,
  sql,
  type SQLWrapper,
} from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

import { instantRange } from '../../common/date-range';
import { pageOf } from '../../common/keyset';
import type { Locale } from '../../common/locales';
import { notInThisList, type SortOrder } from '../../common/sorted-page';
import {
  locations,
  lots,
  partners,
  products,
  type ProductType,
  productVariants,
  stockMovements,
  users,
} from '../../database/schema';
import { quantity } from './code-figures';
import type { ListMovementsDto } from './dto/list-movements.dto';
import type {
  MovementDocument,
  MovementPage,
  MovementPeriod,
  MovementRecipient,
  RecordedMovement,
} from './dto/stock-response.dto';
import { namesIn } from './item-name';
import { pathsOf } from './place-paths';
import type { Tx } from './stock.service';
import { onHandByItem } from './usable-stock';

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
  /** `partners.view`: a sample's recipient, or a receipt's sender (125; ADR-094). */
  partners: boolean;
}

/**
 * What a list of movements reads as beside its rows, by its filters
 * (ADR-093, R21, R24 and R34): a stock card, In, Out and a balance after
 * each row, for one code or one of its lots, at its place when one is
 * chosen too (85a); In and Out with no balance for one code with a reason
 * chosen, which leaves movements out (91a), and for an order, whose
 * items' units differ; else each row's change alone. The list, its period
 * and its export read it, so the three never disagree.
 */
export interface MovementCard {
  /** One code: a variant, or one of its lots. */
  oneCode: boolean;
  /** In and Out apart: one code, or an order. */
  inOut: boolean;
  /** The balance after each row, and a range's opening and closing. */
  balance: boolean;
}

export function cardOf(query: ListMovementsDto): MovementCard {
  const oneCode = Boolean(query.variantId || query.lotId);
  return {
    oneCode,
    inOut: oneCode || Boolean(query.orderId),
    balance: oneCode && !query.reason && !query.orderId,
  };
}

/** A movement's ends and quantity, as a query names them. */
interface Ends {
  from: SQLWrapper;
  to: SQLWrapper;
  quantity: SQLWrapper;
}

/**
 * A movement's change to the stock a list counts (ADR-093, 11a and 85a):
 * at the place chosen, what came to it and, negative, what left it;
 * across every place, what arrived and, negative, what left, a move
 * between two places 0, neither In nor Out, so the balance holds. A
 * quantity is never negative; its direction is which end is set
 * (ADR-023). The one rule each row's In, Out and signed change, the
 * balance and the period read, so the screen and the export sign a row
 * alike (review 24).
 */
function changeOf(ends: Ends, locationId: string | undefined): SQL {
  if (locationId) {
    const here = sql`${locationId}::uuid`;
    return sql`(case when ${ends.to} = ${here} then ${ends.quantity}
      when ${ends.from} = ${here} then -${ends.quantity}
      else 0 end)`;
  }
  return sql`(case when ${ends.from} is null then ${ends.quantity}
    when ${ends.to} is null then -${ends.quantity}
    else 0 end)`;
}

/**
 * The movements a balance counts, as conditions on the table or alias
 * `m`: this organization's, of the code, its lot and its place when
 * chosen; never the range, a reason or an order, none of which a balance
 * is kept with.
 */
function countedBy(
  organizationId: string,
  query: ListMovementsDto,
  m: string,
): SQL {
  const at = sql.raw(m);
  return sql`${at}.organization_id = ${organizationId}::uuid
    ${query.variantId ? sql`and ${at}.variant_id = ${query.variantId}::uuid` : sql``}
    ${query.lotId ? sql`and ${at}.lot_id = ${query.lotId}::uuid` : sql``}
    ${
      query.locationId
        ? sql`and (${at}.from_location_id = ${query.locationId}::uuid
            or ${at}.to_location_id = ${query.locationId}::uuid)`
        : sql``
    }`;
}

/**
 * One page of the ledger as the one movement row (ADR-093, R9 and R20),
 * which Movements, the item's page and the export read: the item by
 * today's name, code and type, the code it was recorded under, its unit;
 * the lot with its expiry; each end with its path; who, when, and the
 * document it was for, each part only for a reader who may see it. Beside
 * them, as the list's filters make it a stock card (cardOf): each row's In
 * and Out, its balance after it, and a date range's period.
 *
 * Newest first, or oldest first with `order=asc`, by when each was
 * recorded and then by id, paged by keyset (afterCursor): offset paging
 * would shift every page down as rows arrive at the head, which an
 * append-only ledger does all day.
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
): Promise<MovementPage> {
  const limit = query.limit ?? 50;
  const order = query.order ?? 'desc';
  const card = cardOf(query);
  const from = alias(locations, 'from_location');
  const to = alias(locations, 'to_location');

  const filters = [
    eq(stockMovements.organizationId, organizationId),
    query.before
      ? await afterCursor(tx, organizationId, query.before, order)
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
      referenceType: stockMovements.referenceType,
      referenceId: stockMovements.referenceId,
      fromLocationId: stockMovements.fromLocationId,
      toLocationId: stockMovements.toLocationId,
      lotId: stockMovements.lotId,
      actorId: stockMovements.actorId,
      createdAt: stockMovements.createdAt,
      change: sql<string>`${changeOf(
        {
          from: stockMovements.fromLocationId,
          to: stockMovements.toLocationId,
          quantity: stockMovements.quantity,
        },
        query.locationId,
      )}`.as('change'),
    })
    .from(stockMovements)
    .where(and(...filters))
    .orderBy(...inOrder(stockMovements.createdAt, stockMovements.id, order))
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
      referenceType: movement.referenceType,
      referenceId: movement.referenceId,
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
      quantityIn: sql<string | null>`case when ${movement.change} > 0
        then ${quantity(sql`${movement.change}`)} end`,
      quantityOut: sql<string | null>`case when ${movement.change} < 0
        then ${quantity(sql`-${movement.change}`)} end`,
      change: sql<string | null>`case when ${movement.change} <> 0
        then ${quantity(sql`${movement.change}`)} end`,
    })
    .from(movement)
    // The organization in each ON clause, though the page is already
    // scoped (ADR-058); users are global, every organization's accounts.
    .leftJoin(
      from,
      and(
        eq(from.id, movement.fromLocationId),
        eq(from.organizationId, organizationId),
      ),
    )
    .leftJoin(
      to,
      and(
        eq(to.id, movement.toLocationId),
        eq(to.organizationId, organizationId),
      ),
    )
    .leftJoin(
      lots,
      and(eq(lots.id, movement.lotId), eq(lots.organizationId, organizationId)),
    )
    .leftJoin(users, eq(users.id, movement.actorId))
    .orderBy(...inOrder(movement.createdAt, movement.id, order));

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
  const recipients = await recipientsOf(
    tx,
    organizationId,
    page.entries,
    sight,
  );
  const balances = card.balance
    ? await balancesOf(
        tx,
        organizationId,
        query,
        page.entries.map((row) => row.id),
      )
    : new Map<string, string>();

  return {
    nextCursor: page.nextCursor,
    period: await periodOf(tx, organizationId, query, card),
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
        recipient: recipients.get(row.id) ?? null,
        quantityIn: row.quantityIn,
        quantityOut: row.quantityOut,
        change: row.change,
        balance: balances.get(row.id) ?? null,
      };
    }),
  };
}

/**
 * Newest first: when recorded, nulls last as the indexes on the time are
 * built (`.desc()`), then the id; oldest first the same indexes read
 * backward, nulls first. created_at is never null, but Postgres reads an
 * index in a query's order only when its nulls come where the index keeps
 * them: ordered newest first with nulls first, as `desc` alone is, the
 * first page at ADR-051's large scale sorted every movement of the
 * organization, 83 ms, where it now reads 51 rows from the index, 0.3 ms.
 */
function inOrder(
  createdAt: SQLWrapper,
  id: SQLWrapper,
  order: SortOrder,
): SQL[] {
  return order === 'asc'
    ? [sql`${createdAt} asc nulls first`, sql`${id} asc`]
    : [sql`${createdAt} desc nulls last`, sql`${id} desc`];
}

/**
 * The movements after the cursor's, in the list's order, by when each was
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
 * The time bounds the condition on its own, `created_at <= t` newest
 * first, so an index on the time starts at the cursor, rather than at the
 * newest movement, reading every one between.
 */
async function afterCursor(
  tx: Tx,
  organizationId: string,
  before: string,
  order: SortOrder,
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
  return order === 'asc'
    ? sql`(${stockMovements.createdAt} >= ${at}
      and (${stockMovements.createdAt} > ${at} or ${gt(stockMovements.id, before)}))`
    : sql`(${stockMovements.createdAt} <= ${at}
      and (${stockMovements.createdAt} < ${at} or ${lt(stockMovements.id, before)}))`;
}

/**
 * Each row's balance after it, by the movement's id (ADR-093, 41a): the
 * stock the list counts today, on hand by the one read (onHandByItem: the
 * code's, at its place, in its lot), less what moved after the row. A
 * page reads only the movements newer than its newest, one range of the
 * code's index on the time, and its own rows, never the whole history; a
 * row's own movements after it are the page's newer rows, summed in the
 * one fixed order, the time and then the id, so two movements in one
 * minute keep theirs. Read in one statement, so the on hand and what moved
 * after are of one moment.
 */
async function balancesOf(
  tx: Tx,
  organizationId: string,
  query: ListMovementsDto,
  movementIds: string[],
): Promise<Map<string, string>> {
  if (movementIds.length === 0) return new Map();

  const ends = (m: string): Ends => ({
    from: sql.raw(`${m}.from_location_id`),
    to: sql.raw(`${m}.to_location_id`),
    quantity: sql.raw(`${m}.quantity`),
  });
  const { rows } = await tx.execute<{ id: string; balance: string }>(sql`
    with page as (
      select pm.id, pm.created_at,
        ${changeOf(ends('pm'), query.locationId)} as change
      from stock_movements pm
      where pm.organization_id = ${organizationId}::uuid
        and pm.id in (${sql.join(
          movementIds.map((id) => sql`${id}::uuid`),
          sql`, `,
        )})
    ),
    newest as (
      select np.created_at, np.id from page np
      order by np.created_at desc, np.id desc
      limit 1
    ),
    here as (
      select coalesce(sum(oh.on_hand), 0) as on_hand
      from (${onHandByItem(
        organizationId,
        query.variantId ? sql`(${query.variantId}::uuid)` : undefined,
        query.locationId,
        query.lotId,
      )}) oh
    ),
    later as (
      select coalesce(sum(${changeOf(ends('lm'), query.locationId)}), 0)
        as moved
      from stock_movements lm, newest n
      where ${countedBy(organizationId, query, 'lm')}
        and lm.created_at >= n.created_at
        and (lm.created_at > n.created_at or lm.id > n.id)
    )
    select p.id,
      ${quantity(sql`here.on_hand - later.moved - coalesce(sum(p.change) over (
        order by p.created_at desc, p.id desc
        rows between unbounded preceding and 1 preceding
      ), 0)`)} as balance
    from page p, here, later
  `);
  return new Map(rows.map((row) => [row.id, row.balance]));
}

/**
 * A date range's stock card for one code (ADR-093, R34; 88a): every In
 * and every Out over the range, with the list's filters, and the balance
 * at its start and at its end. Closing is today's on hand less what moved
 * after the range, and Opening the Closing less the range's In plus its
 * Out, so Closing = Opening + In − Out holds by construction, and a range
 * ending today closes at today's on hand. Opening and Closing only where
 * the list keeps a balance (91a). Null for several items, whose units
 * differ, and without a range.
 */
async function periodOf(
  tx: Tx,
  organizationId: string,
  query: ListMovementsDto,
  card: MovementCard,
): Promise<MovementPeriod | null> {
  if (!card.oneCode || (!query.from && !query.until)) return null;

  // No alias: the order's condition names the ledger's own columns.
  const change = changeOf(
    {
      from: stockMovements.fromLocationId,
      to: stockMovements.toLocationId,
      quantity: stockMovements.quantity,
    },
    query.locationId,
  );
  const inRange = query.until
    ? sql`${stockMovements.createdAt} < ${query.until}::timestamptz`
    : sql`true`;
  const kept = [
    query.orderId ? ofOrder(organizationId, query.orderId) : undefined,
    query.reason ? eq(stockMovements.reason, query.reason) : undefined,
    query.from
      ? gte(stockMovements.createdAt, new Date(query.from))
      : undefined,
  ].filter((filter): filter is SQL => filter !== undefined);
  const here = onHandByItem(
    organizationId,
    query.variantId ? sql`(${query.variantId}::uuid)` : undefined,
    query.locationId,
    query.lotId,
  );

  const { rows } = await tx.execute<{
    opening: string | null;
    quantity_in: string;
    quantity_out: string;
    closing: string | null;
  }>(sql`
    with moved as (
      select
        coalesce(sum(${change}) filter (where ${change} > 0 and ${inRange}), 0)
          as quantity_in,
        coalesce(sum(-${change}) filter (where ${change} < 0 and ${inRange}), 0)
          as quantity_out,
        coalesce(sum(${change}) filter (where not ${inRange}), 0) as later
      from stock_movements
      where ${countedBy(organizationId, query, 'stock_movements')}
        ${kept.length > 0 ? sql`and ${and(...kept)}` : sql``}
    ),
    closed as (
      select ${
        card.balance
          ? sql`(select coalesce(sum(oh.on_hand), 0) from (${here}) oh) - m.later`
          : sql`null::numeric`
      } as closing, m.*
      from moved m
    )
    select
      ${quantity(sql`c.closing - c.quantity_in + c.quantity_out`)} as opening,
      ${quantity(sql`c.quantity_in`)} as quantity_in,
      ${quantity(sql`c.quantity_out`)} as quantity_out,
      ${quantity(sql`c.closing`)} as closing
    from closed c
  `);
  const [period] = rows;
  return {
    opening: period.opening,
    quantityIn: period.quantity_in,
    quantityOut: period.quantity_out,
    closing: period.closing,
  };
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

/**
 * Each movement's partner, by the movement's id (125): the partner Send
 * sample recorded as its reference, or the one a receipt with no order
 * came from (ADR-094, R11), which only these two may carry, checked
 * against this organization when it was (ADR-042; `referenceFor`), for
 * the page's rows alone, and only for a reader with partners.view. A
 * movement with no partner recorded has none here.
 */
async function recipientsOf(
  tx: Tx,
  organizationId: string,
  rows: {
    id: string;
    referenceType: string | null;
    referenceId: string | null;
  }[],
  sight: MovementSight,
): Promise<Map<string, MovementRecipient>> {
  const samples = rows.filter(
    (row) => row.referenceType === 'partner' && row.referenceId !== null,
  );
  if (!sight.partners || samples.length === 0) return new Map();

  const found = await tx
    .select({ id: partners.id, name: partners.name })
    .from(partners)
    .where(
      and(
        eq(partners.organizationId, organizationId),
        inArray(partners.id, [
          ...new Set(samples.map((row) => row.referenceId!)),
        ]),
      ),
    );
  const names = new Map(found.map((partner) => [partner.id, partner.name]));

  return new Map(
    samples.flatMap((row) => {
      const name = names.get(row.referenceId!);
      return name ? [[row.id, { id: row.referenceId!, name }] as const] : [];
    }),
  );
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
