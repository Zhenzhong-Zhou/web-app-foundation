import type { INestApplicationContext } from '@nestjs/common';
import { and, eq, sql } from 'drizzle-orm';

import { StockGroupedService } from '../modules/stock/stock-grouped.service';
import { StockReadsService } from '../modules/stock/stock-reads.service';
import { WhereItStandsService } from '../modules/stock/where-it-stands.service';
import type { Database } from './database.module';
import {
  orderLines,
  orders,
  productVariants,
  reorderPoints,
  stockMovements,
} from './schema';
import { daysFromNow } from './seed-demo-variety';

/**
 * What Inventory's screens read in the demo (ADR-093, R18), read back
 * through the same reads they use, after everything else is written, so a
 * change upstream that takes one away fails the seed and CI with it, as
 * Reorder points' counts do (seed-demo-team-work.ts).
 *
 * Nothing is written here: each state is made by the step that already
 * has its story, and named below by the example the manual checks use.
 *
 * - **A lot in two places:** D3-B02, 80 on Main's Shelf and 40 on
 *   Richmond's Shelf 1-B (the transfer), so the Lot view says "1 of 2
 *   places" on each of its rows.
 * - **A lot expired in a place not usable:** VC-0301, in Richmond's
 *   Quarantine.
 * - **Held, one of them short, and one not:** FOCUS-60CT's confirmed
 *   sales want 162 more than it has; ELDER-250's two hold 60 of its 70.
 * - **Coming:** purchase orders with a day (the elderberry's, late), and
 *   CALM-RUN-01, a released run, which has none.
 * - **A made item with a reorder point:** SLEEP-60CT, MAGCAP-SAMPLE.
 * - **A code changed once:** VITC-100, its two receipts in the ledger
 *   under VITC-90 (seed-demo-team-work.ts).
 * - **A lot with no expiry after dated lots of its code:** D3-C07, on
 *   Main's Shelf after D3-A11 and D3-B02, as its row opens (R2).
 * - **An item with a code low and one out:** MAGCAP, its 120 low and its
 *   240 out, its lot quarantined, as Where it stands lists them (R23).
 *
 * And what Movements' screens read (ADR-093, R13 and R18), through the
 * movement list itself:
 *
 * - **An order shipped from two lots:** SO-DEMO-5's vitamin D, 30 from
 *   D3-A11 and 30 from D3-B02, two movements alike but for their lot
 *   (seed-demo-variety.ts).
 * - **A move to quarantine:** VC-0301's 48 into Richmond's Quarantine.
 * - **A lot with no cost:** THE-0915, as Stock value's Waiting for a cost
 *   lists it (PO-DEMO-5).
 * - **A confirmed order in each state of what has come or gone:** a
 *   purchase order not received, partly received and all received (a line
 *   closed short counting as done, as `outstandingOrder` counts it), and a
 *   sale not shipped, partly shipped and all shipped, which #605's label
 *   tells apart.
 */
export async function readBackStock(
  app: INestApplicationContext,
  db: Database,
  organizationId: string,
): Promise<string> {
  const grouped = app.get(StockGroupedService);
  const today = daysFromNow(0);

  const codes = await grouped.byCode({ limit: 100 }, 'en');
  const lots = await grouped.byLot({ limit: 100 }, 'en', true);

  if (codes.nextCursor || lots.nextCursor) {
    throw new Error(
      'The demo holds more than one page of Inventory; read it by pages',
    );
  }

  const twoPlaces = [
    ...new Set(
      lots.entries
        .filter((row) => row.places >= 2 && row.lotCode)
        .map((row) => row.lotCode),
    ),
  ];
  const quarantined = lots.entries.filter(
    (row) =>
      !row.isAvailable && row.lotExpiresAt !== null && row.lotExpiresAt < today,
  );
  const short = codes.entries.filter((row) => Number(row.short) > 0);
  const holdingNotShort = codes.entries.filter(
    (row) => Number(row.held) > 0 && Number(row.short) === 0,
  );
  const comingOn = codes.entries.filter(
    (row) => Number(row.coming) > 0 && row.comingOn !== null,
  );
  const comingWithNoDay = codes.entries.filter(
    (row) => Number(row.coming) > 0 && row.comingOn === null,
  );

  const [{ made }] = await db
    .select({ made: sql<number>`count(*)::int` })
    .from(reorderPoints)
    .where(
      and(
        eq(reorderPoints.organizationId, organizationId),
        eq(reorderPoints.source, 'made'),
      ),
    );

  const [changed] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(productVariants.sku, 'VITC-100'),
      ),
    );
  const written = await db
    .selectDistinct({ sku: stockMovements.sku })
    .from(stockMovements)
    .where(
      and(
        eq(stockMovements.organizationId, organizationId),
        eq(stockMovements.variantId, changed.id),
      ),
    );
  const codesWritten = written.map((row) => row.sku).sort();

  // Where a code's row opens: its place's lots, the undated after the dated.
  const vitaminD = codes.entries.find((row) => row.sku === 'D3-1000-120');
  const vitaminDLots = vitaminD
    ? (await grouped.places(vitaminD.variantId, {}, 'en', true)).places
        .flatMap((place) => place.lots)
        .filter((lot) => lot.locationName === 'Shelf')
        .map((lot) => [lot.lotCode, lot.lotExpiresAt] as const)
    : [];
  const undatedLast =
    vitaminDLots.length > 2 &&
    vitaminDLots.at(-1)?.[0] === 'D3-C07' &&
    vitaminDLots.at(-1)?.[1] === null &&
    vitaminDLots.slice(0, -1).every(([, expiresAt]) => expiresAt !== null);

  // An item whose codes stand apart: Items shows its worst, and how many.
  const [magnesium] = await db
    .select({ productId: productVariants.productId })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(productVariants.sku, 'MAGCAP-120'),
      ),
    );
  const magnesiumStands = (
    await app.get(WhereItStandsService).read(magnesium.productId, 'en', {
      places: true,
      orders: true,
      runs: true,
    })
  ).codes.map((code) => `${code.sku} ${code.status ?? 'none'}`);

  // What Movements lists, read as its own list reads it, as the Owner.
  const movements = app.get(StockReadsService);
  const sight = { places: true, orders: true, runs: true };
  const [shippedOrder] = await db
    .select({ id: orders.id })
    .from(orders)
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(orders.reference, 'SO-DEMO-5'),
      ),
    );
  const shipments = shippedOrder
    ? (
        await movements.listMovements(
          { orderId: shippedOrder.id, limit: 100 },
          'en',
          sight,
        )
      ).entries.filter((movement) => movement.reason === 'shipment')
    : [];
  const fromTwoLots = shipments.filter((one) =>
    shipments.some(
      (other) =>
        other.variantId === one.variantId &&
        other.quantity === one.quantity &&
        other.lotId !== one.lotId,
    ),
  );
  const toQuarantine = (
    await movements.listMovements(
      { reason: 'transfer', limit: 100 },
      'en',
      sight,
    )
  ).entries.filter((movement) => movement.toLocationName === 'Quarantine');
  const noCost = (
    await grouped.byLot({ limit: 100, needsCost: 'true' }, 'en', true)
  ).entries.filter((row) => row.lotCode === 'THE-0915');

  // Confirmed orders by what has come or gone, a line closed short counted
  // as done, as #605's label will tell them apart.
  const confirmedLines = await db
    .select({
      orderId: orders.id,
      direction: orders.direction,
      ordered: orderLines.quantityOrdered,
      done: orderLines.quantityFulfilled,
      closedShort: orderLines.isClosedShort,
    })
    .from(orders)
    .innerJoin(
      orderLines,
      and(
        eq(orderLines.orderId, orders.id),
        eq(orderLines.organizationId, orders.organizationId),
      ),
    )
    .where(
      and(
        eq(orders.organizationId, organizationId),
        eq(orders.status, 'confirmed'),
      ),
    );
  const linesOf = new Map<string, typeof confirmedLines>();
  for (const line of confirmedLines) {
    linesOf.set(line.orderId, [...(linesOf.get(line.orderId) ?? []), line]);
  }
  const orderStates = new Set<string>();
  for (const lines of linesOf.values()) {
    const allDone = lines.every(
      (line) => line.closedShort || Number(line.done) >= Number(line.ordered),
    );
    const someDone = lines.some((line) => Number(line.done) > 0);
    orderStates.add(
      `${lines[0].direction} ${allDone ? 'all' : someDone ? 'partly' : 'none'}`,
    );
  }

  const missing: string[] = [];
  if (twoPlaces.length === 0) missing.push('a lot in two places');
  if (quarantined.length === 0) {
    missing.push('an expired lot in a place not usable');
  }
  if (short.length === 0) missing.push('a code short of what is held');
  if (holdingNotShort.length === 0) missing.push('a code holding, not short');
  if (comingOn.length === 0) missing.push('stock coming with a day');
  if (comingWithNoDay.length === 0) missing.push('stock coming with no day');
  if (made === 0) missing.push('a made item with a reorder point');
  if (codesWritten.join() !== 'VITC-100,VITC-90') {
    missing.push(
      `a code changed once, VITC-100 kept in the ledger as ${codesWritten.join(' and ')}`,
    );
  }
  if (!undatedLast) {
    missing.push(
      `a lot with no expiry after D3-1000-120's dated lots on Shelf, read ${vitaminDLots.map(([code]) => code).join(', ')}`,
    );
  }
  if (
    !magnesiumStands.includes('MAGCAP-240 out') ||
    !magnesiumStands.includes('MAGCAP-120 low')
  ) {
    missing.push(
      `an item with a code low and one out, MAGCAP read ${magnesiumStands.join(', ')}`,
    );
  }
  if (fromTwoLots.length < 2) {
    missing.push(
      'an order shipped from two lots, two movements of one quantity, in SO-DEMO-5',
    );
  }
  if (toQuarantine.length === 0) missing.push('a move into Quarantine');
  if (noCost.length === 0) missing.push('a lot waiting for a cost, THE-0915');
  for (const [state, words] of [
    ['purchase none', 'a confirmed purchase order not received'],
    ['purchase partly', 'a confirmed purchase order partly received'],
    ['purchase all', 'a confirmed purchase order all received'],
    ['sale none', 'a confirmed sale not shipped'],
    ['sale partly', 'a confirmed sale partly shipped'],
    ['sale all', 'a confirmed sale all shipped'],
  ]) {
    if (!orderStates.has(state)) missing.push(words);
  }
  if (missing.length > 0) {
    throw new Error(
      `The demo's Inventory is missing: ${missing.join('; ')}. See seed-demo-stock.ts for where each is made`,
    );
  }

  return (
    `Inventory read back: ${twoPlaces.length} lots in two places (${twoPlaces.slice(0, 3).join(', ')}), ` +
    `${quarantined.length} expired in a place not usable, ${short.length} short and ${holdingNotShort.length} holding without being short, ` +
    `${comingOn.length} coming with a day and ${comingWithNoDay.length} without, ${made} made items with a reorder point, VITC-100 written as VITC-90 once, ` +
    `D3-C07 with no expiry after D3-1000-120's dated lots, MAGCAP-240 out and MAGCAP-120 low (${magnesiumStands.join(', ')}); ` +
    `Movements: SO-DEMO-5 shipped ${fromTwoLots.length} movements of ${fromTwoLots[0].quantity} from ${[...new Set(fromTwoLots.map((movement) => movement.lotCode))].join(' and ')}, ` +
    `${toQuarantine.length} moves into Quarantine, THE-0915 waiting for a cost, confirmed orders in every state of what has come or gone`
  );
}
