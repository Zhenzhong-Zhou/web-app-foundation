import { type APIRequestContext, expect } from '@playwright/test';

import {
  created,
  createLocation,
  createPartner,
  createProduct,
  daysFromNow,
  type SeededLocation,
  type SeededPartner,
  type SeededProduct,
} from './api';

/**
 * Inventory's scenes for the browser tests of ADR-093's tables (Stock, the
 * item's page and Reorder), each set up through the API in an organization
 * of the test's own, since its tests count rows and read figures.
 */

/** Stock received at a place, in a lot when given; the lot's id. */
export async function receive(
  api: APIRequestContext,
  product: SeededProduct,
  place: SeededLocation,
  quantity: string,
  lot?: { code: string; expiresAt?: string },
): Promise<string | null> {
  const { movement } = await created<{ movement: { lotId: string | null } }>(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: place.id,
        quantity,
        reason: 'receipt',
        lot,
      },
    }),
  );
  return movement.lotId;
}

/** Part of a lot moved from one place to another. */
export async function moveLot(
  api: APIRequestContext,
  product: SeededProduct,
  lotId: string,
  from: SeededLocation,
  to: SeededLocation,
  quantity: string,
): Promise<void> {
  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        lotId,
        fromLocationId: from.id,
        toLocationId: to.id,
        quantity,
        reason: 'transfer',
      },
    }),
  );
}

/**
 * Fifty-two codes with stock, one more page's worth than the first fifty:
 * "E2E Page 01" to "E2E Page 52", 3 each on one shelf.
 */
export async function fiftyTwo(api: APIRequestContext): Promise<void> {
  const shelf = await createLocation(api, { name: 'E2E Bulk' });
  for (let start = 1; start <= 52; start += 13) {
    await Promise.all(
      Array.from({ length: 13 }, async (_, index) => {
        const product = await createProduct(api, {
          name: `E2E Page ${String(start + index).padStart(2, '0')}`,
        });
        await receive(api, product, shelf, '3');
      }),
    );
  }
}

/** A reorder point (ADR-085): what makes a code Low stock or Out. */
export async function reorderAt(
  api: APIRequestContext,
  product: SeededProduct,
  point: string,
  source: 'bought' | 'made' = 'bought',
): Promise<void> {
  const response = await api.post(
    `/v1/stock/reorder-points/${product.variantId}`,
    { data: { source, reorderPoint: point, rule: 'just_enough' } },
  );
  expect(response.ok(), await response.text()).toBeTruthy();
}

export interface SeededOrder {
  id: string;
  number: string;
}

/** An order of one line, confirmed unless it stays a draft. */
export async function orderOf(
  api: APIRequestContext,
  partner: SeededPartner,
  direction: 'sale' | 'purchase',
  product: SeededProduct,
  quantity: string,
  status: 'confirmed' | 'draft' = 'confirmed',
): Promise<SeededOrder> {
  const { order } = await created<{ order: SeededOrder }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction,
        lines: [
          {
            variantId: product.variantId,
            quantityOrdered: quantity,
            unitPrice: '2.50',
            currency: 'CAD',
          },
        ],
      },
    }),
  );
  if (status === 'draft') return order;
  const confirmed = await api.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();
  return { id: order.id, number: order.number };
}

/** Stock's scene: two shelves, an item low with lots, and one short. */
export interface StockScene {
  shelfA: SeededLocation;
  shelfB: SeededLocation;
  /**
   * Lot-tracked, 56 on hand: VC-SOON, 10 days off, 15 on A and 5 on B;
   * VC-LATE, 200 days off, 30 on A; VC-GONE, expired 4 days ago, 6 on B,
   * not usable. A sale holds 30 of its 50 usable, so 20 left under a
   * reorder point of 100: Low, and Buy 80.
   */
  vitamin: SeededProduct;
  /** 10 on A, which a sale of 25 holds whole: 15 short. */
  magnesium: SeededProduct;
  partner: SeededPartner;
  /** The sale waiting for magnesium. */
  waiting: SeededOrder;
}

export async function stockScene(api: APIRequestContext): Promise<StockScene> {
  const [shelfA, shelfB, partner] = await Promise.all([
    createLocation(api, { name: 'E2E Shelf A2' }),
    createLocation(api, { name: 'E2E Shelf B1' }),
    createPartner(api, { name: 'E2E Corner Pharmacy' }),
  ]);
  const [vitamin, magnesium] = await Promise.all([
    createProduct(api, {
      name: 'E2E Vitamin C',
      sku: 'E2E-VITC',
      tracksLots: true,
    }),
    createProduct(api, { name: 'E2E Magnesium', sku: 'E2E-MAG' }),
  ]);

  const soon = await receive(api, vitamin, shelfA, '20', {
    code: 'VC-SOON',
    expiresAt: daysFromNow(10),
  });
  await moveLot(api, vitamin, soon!, shelfA, shelfB, '5');
  await receive(api, vitamin, shelfA, '30', {
    code: 'VC-LATE',
    expiresAt: daysFromNow(200),
  });
  await receive(api, vitamin, shelfB, '6', {
    code: 'VC-GONE',
    expiresAt: daysFromNow(-4),
  });
  await reorderAt(api, vitamin, '100');
  await orderOf(api, partner, 'sale', vitamin, '30');

  await receive(api, magnesium, shelfA, '10');
  const waiting = await orderOf(api, partner, 'sale', magnesium, '25');

  return { shelfA, shelfB, vitamin, magnesium, partner, waiting };
}

/** Reorder's scene: Stock's, and three more under reorder points. */
export interface ReorderScene extends StockScene {
  /** 5 on A under a point of 20, bought: Low, Buy 15. */
  zinc: SeededProduct;
  /** Made, nothing on hand under a point of 1,000: Out, Make 1,000. */
  focus: SeededProduct;
  /** 10 on A under a point of 50, its 40 in a draft of 60: greyed. */
  copper: SeededProduct;
  draft: SeededOrder;
}

export async function reorderScene(
  api: APIRequestContext,
): Promise<ReorderScene> {
  const stock = await stockScene(api);
  const [zinc, focus, copper] = await Promise.all([
    createProduct(api, { name: 'E2E Zinc', sku: 'E2E-ZINC' }),
    createProduct(api, { name: 'E2E Focus', sku: 'E2E-FOCUS' }),
    createProduct(api, { name: 'E2E Copper', sku: 'E2E-COPPER' }),
  ]);
  await receive(api, zinc, stock.shelfA, '5');
  await reorderAt(api, zinc, '20');
  await reorderAt(api, focus, '1000', 'made');
  await receive(api, copper, stock.shelfA, '10');
  await reorderAt(api, copper, '50');
  const draft = await orderOf(
    api,
    stock.partner,
    'purchase',
    copper,
    '60',
    'draft',
  );
  return { ...stock, zinc, focus, copper, draft };
}
