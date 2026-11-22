import type { INestApplicationContext } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';

import { AUDIT_ACTIONS } from '../core/audit/audit-actions';
import { ProductsService } from '../modules/products/products.service';
import { LotChangesService } from '../modules/stock/lot-changes.service';
import { LotTraceService } from '../modules/stock/lot-trace.service';
import { LotTrackingService } from '../modules/stock/lot-tracking.service';
import { StockService } from '../modules/stock/stock.service';
import { StockGroupedService } from '../modules/stock/stock-grouped.service';
import type { Database } from './database.module';
import { productVariants } from './schema';
import type { Audited } from './seed-demo-audit';
import { orderSteps } from './seed-demo-orders';
import { daysFromNow } from './seed-demo-variety';

/**
 * What seed:demo holds to start tracking lots, and to read lots by their
 * details (ADR-094, R23): two items of their own, made after every figure
 * the manual checks name, so none of those moves.
 *
 * - **BOTTLE-A60,** the amber bottle seed-demo-team-work.ts made, which
 *   does not track lots, with 1,500 bought and put away in two places, 900
 *   on Main's Shelf and 600 in the Blending room: what "Start tracking
 *   lots…" asks about, and what its question lists. It had none; its late
 *   order, PO-DEMO-9, is left as it was.
 * - **K2-60CT,** vitamin K2, which does, with:
 *   - **a code made here, with both details to add:** received as opening
 *     stock, its expiry not known yet and no supplier's lot (R5, R8, R9),
 *     so Details to add lists it and the lot reads "Expiry to add" and
 *     "Supplier's lot to add";
 *   - **a code made here that carries its supplier's lot,** Hx-2609, which
 *     the top bar's search finds by it (R6, MC-909);
 *   - **a receipt of each reason,** with no order: opening stock, returned
 *     by a customer, a sample from the supplier, and other with a note
 *     (R11); the three with a partner name it as where the stock came from;
 *   - **a lot part of which moved to another:** K2-2609, 200 bought, 20 of
 *     it shipped to Northside Pharmacy, 80 moved into K2-2609B and 30 of
 *     that shipped to Harbour Health. Harbour Health received only the
 *     second lot, and the first lot's recall list reaches it through that
 *     lot (R20, R21; MC-908).
 *
 * Through the services, with the audit row each route writes, as the rest
 * of the demo is. K2-60CT is made here and BOTTLE-A60 found by its code. Read back as the screens read it, so a change upstream
 * that loses one of them fails the seed, and CI with it.
 */

/** What seed-demo.ts has made that this builds on. */
export interface LotAnchors {
  actorId: string;
  shelfId: string;
  blendingId: string;
  supplierId: string;
  customerId: string;
  secondCustomerId: string;
}

export async function addLots(
  app: INestApplicationContext,
  db: Database,
  audited: Audited,
  organizationId: string,
  anchors: LotAnchors,
): Promise<string> {
  const products = app.get(ProductsService);
  const stock = app.get(StockService);
  const lotChanges = app.get(LotChangesService);
  const lotTracking = app.get(LotTrackingService);
  const grouped = app.get(StockGroupedService);
  const trace = app.get(LotTraceService);

  const actor = anchors.actorId;
  const ordering = orderSteps(app, audited, actor);

  const [bottle] = await db
    .select({ id: productVariants.id, productId: productVariants.productId })
    .from(productVariants)
    .where(
      and(
        eq(productVariants.organizationId, organizationId),
        eq(productVariants.sku, 'BOTTLE-A60'),
      ),
    );
  if (!bottle) throw new Error('The demo has no item BOTTLE-A60');
  const k2 = await products.create({
    type: 'good',
    name: 'Vitamin K2 100 mcg, 60 capsules',
    variant: { sku: 'K2-60CT', unitOfMeasure: 'each', tracksLots: true },
  });
  const bottleId = bottle.id;
  const k2Id = k2.variants[0].id;

  /** A receipt or a move with no order, as Receive stock writes it. */
  function record(input: Parameters<StockService['record']>[0]) {
    return audited(
      actor,
      {
        action: AUDIT_ACTIONS.STOCK_MOVEMENT_RECORDED,
        type: 'stock_movement',
        id: (recorded: { id: string }) => recorded.id,
      },
      () => stock.record(input, actor),
    );
  }

  /** A purchase of one line, confirmed and received whole on the shelf. */
  async function bought(
    reference: string,
    variantId: string,
    quantity: string,
    unitPrice: string,
    lot?: { code: string; expiresAt: string },
  ) {
    const order = await ordering.create({
      partnerId: anchors.supplierId,
      direction: 'purchase',
      reference,
      lines: [
        {
          variantId,
          quantityOrdered: quantity,
          unitPrice,
          currency: 'CAD',
        },
      ],
    });
    await ordering.setStatus(order.id, 'confirmed');
    return ordering.receive(order.id, order.lines[0].id, {
      toLocationId: anchors.shelfId,
      quantity,
      lot,
    });
  }

  // The code to start tracking: 1,500 on the shelf, 600 of it carried to
  // the Blending room, so the question names two places.
  await bought('PO-DEMO-14', bottleId, '1500', '0.3500');
  await record({
    variantId: bottleId,
    fromLocationId: anchors.shelfId,
    toLocationId: anchors.blendingId,
    quantity: '600',
    reason: 'transfer',
  });

  // The delivery that is later split between two lots.
  const first = await bought('PO-DEMO-15', k2Id, '200', '6.4000', {
    code: 'K2-2609',
    expiresAt: daysFromNow(500),
  });
  if (!first.lotId) throw new Error('The K2 delivery made no lot');

  const sold = await ordering.create({
    partnerId: anchors.customerId,
    direction: 'sale',
    reference: 'SO-DEMO-11',
    lines: [
      {
        variantId: k2Id,
        quantityOrdered: '20',
        unitPrice: '18.9900',
        currency: 'CAD',
      },
    ],
  });
  await ordering.setStatus(sold.id, 'confirmed');
  await ordering.ship(sold.id, {
    fromLocationId: anchors.shelfId,
    carrier: 'Canada Post',
    lines: [
      {
        lineId: sold.lines[0].id,
        quantity: '20',
        lots: [{ lotId: first.lotId, quantity: '20' }],
      },
    ],
  });

  // Part of what is left was a second lot of the supplier's, boxed with it.
  const moved = await audited(
    actor,
    {
      action: AUDIT_ACTIONS.STOCK_MOVEMENT_RECORDED,
      type: 'stock_movement',
      id: (result: { movement: { id: string } }) => result.movement.id,
    },
    () =>
      lotChanges.move(
        first.lotId!,
        {
          locationId: anchors.shelfId,
          quantity: '80',
          lot: { code: 'K2-2609B', expiresAt: daysFromNow(560) },
          note: 'Half the delivery was the supplier’s second lot, K2-2609B',
        },
        actor,
      ),
  );

  const resold = await ordering.create({
    partnerId: anchors.secondCustomerId,
    direction: 'sale',
    reference: 'SO-DEMO-12',
    lines: [
      {
        variantId: k2Id,
        quantityOrdered: '30',
        unitPrice: '18.9900',
        currency: 'CAD',
      },
    ],
  });
  await ordering.setStatus(resold.id, 'confirmed');
  await ordering.ship(resold.id, {
    fromLocationId: anchors.shelfId,
    carrier: 'Canada Post',
    lines: [
      {
        lineId: resold.lines[0].id,
        quantity: '30',
        lots: [{ lotId: moved.toLot.id, quantity: '30' }],
      },
    ],
  });

  // A receipt of each reason, with no order (R11). The first two codes are
  // made here: one with both details still to add, one with its supplier's
  // lot and its date.
  await record({
    variantId: k2Id,
    toLocationId: anchors.shelfId,
    quantity: '120',
    reason: 'receipt',
    reasonDetail: 'opening',
    lot: { makeCode: true, expiry: 'unknown' },
  });
  await record({
    variantId: k2Id,
    toLocationId: anchors.shelfId,
    quantity: '4',
    reason: 'receipt',
    reasonDetail: 'sample',
    recipientPartnerId: anchors.supplierId,
    lot: {
      makeCode: true,
      supplierLot: 'Hx-2609',
      expiry: 'date',
      expiresAt: daysFromNow(400),
    },
  });
  await record({
    variantId: k2Id,
    toLocationId: anchors.shelfId,
    quantity: '6',
    reason: 'receipt',
    reasonDetail: 'returned',
    recipientPartnerId: anchors.customerId,
    lot: { code: 'K2-2601', expiresAt: daysFromNow(300) },
  });
  await record({
    variantId: k2Id,
    toLocationId: anchors.shelfId,
    quantity: '30',
    reason: 'receipt',
    reasonDetail: 'other',
    note: 'Found behind the pallet, not on the packing list',
    lot: { code: 'K2-2610', expiresAt: daysFromNow(520) },
  });

  // Read back as the screens read it.
  const question = await lotTracking.question(bottle.productId, bottleId, {
    runs: false,
  });
  const toAdd = (
    await grouped.byLot({ limit: 100, detailsToAdd: 'true' }, 'en', true)
  ).entries.filter((row) => row.sku === 'K2-60CT');
  const bothToAdd = toAdd.find(
    (row) =>
      row.lotIsAssigned === true &&
      row.lotExpiry === 'unknown' &&
      row.lotSupplierLot === null,
  );
  const carrying = (
    await grouped.byLot({ limit: 100 }, 'en', true)
  ).entries.find(
    (row) => row.sku === 'K2-60CT' && row.lotSupplierLot === 'Hx-2609',
  );
  const recall = await trace.trace(first.lotId, 'en', true);
  const harbour = recall.recipients.find(
    (row) =>
      row.partnerId === anchors.secondCustomerId && row.lotCode === 'K2-2609B',
  );
  const northside = recall.recipients.find(
    (row) => row.partnerId === anchors.customerId && row.lotCode === 'K2-2609',
  );

  const missing: string[] = [];
  if (question.places.length !== 2) {
    missing.push(
      `BOTTLE-A60 at two places, its question read ${question.places.length}`,
    );
  }
  if (!bothToAdd) {
    missing.push('a lot made here with both its details to add');
  }
  if (!carrying)
    missing.push("a lot made here with its supplier's lot Hx-2609");
  if (!northside || !harbour) {
    missing.push(
      "K2-2609's recall list reaching Northside through K2-2609 and Harbour Health through K2-2609B",
    );
  }
  if (missing.length > 0) {
    throw new Error(
      `The demo's lots are missing: ${missing.join('; ')}. See seed-demo-lots.ts`,
    );
  }

  return (
    `Lots read back: BOTTLE-A60 holds ${Number(question.onHand)} at ${question.places.length} places and tracks none; ` +
    `${bothToAdd!.lotCode} made here with its expiry and its supplier's lot to add; ` +
    `${carrying!.lotCode} made here with supplier's lot Hx-2609; ` +
    `a receipt each of opening stock, a sample, returned and other; ` +
    `K2-2609 moved 80 into K2-2609B, Harbour Health receiving only the second and on the first's recall list`
  );
}
