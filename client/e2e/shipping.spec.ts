import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, daysFromNow, signInAs } from './support/api';

/**
 * Shipping a sales order through the browser (ADR-041): one dialog for the
 * whole order, a line left behind for a later shipment, lots taken earliest
 * expiry first and shown before anything moves, then the rest shipped and
 * the order closed.
 *
 * Seeded through the API, acted on through the UI. What only a browser can
 * check is that the dialog asks for the preview and renders it, sends only
 * the lines with something to ship, and that the page reads the one stored
 * status as "Shipped" on a sale.
 */

async function seedSale(api: APIRequestContext) {
  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'E2E Pharmacy', code: 'E2E-PH' },
    }),
  );

  const { location: shelf } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: { type: 'site', name: 'E2E Shelf' },
    }),
  );

  const variantOf = async (sku: string, tracksLots: boolean) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: { type: 'good', name: sku, variant: { sku, tracksLots } },
        }),
      )
    ).product.variants[0].id;

  const focus = await variantOf('E2E-SHIP-FOCUS', true);
  const scoop = await variantOf('E2E-SHIP-SCOOP', false);

  // Two lots with different expiries, so the preview has a choice to make.
  for (const [code, days] of [
    ['LATE-SHIP', 400],
    ['EARLY-SHIP', 100],
  ] as const) {
    await created(
      await api.post('/v1/stock/movements', {
        data: {
          variantId: focus,
          toLocationId: shelf.id,
          quantity: '20',
          reason: 'receipt',
          lot: { code, expiresAt: daysFromNow(days) },
        },
      }),
    );
  }

  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId: scoop,
        toLocationId: shelf.id,
        quantity: '50',
        reason: 'receipt',
      },
    }),
  );

  const { order } = await created<{ order: { id: string } }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        reference: 'E2E-SO-1',
        lines: [
          {
            variantId: focus,
            quantityOrdered: '25',
            unitPrice: '10',
            currency: 'CAD',
          },
          {
            variantId: scoop,
            quantityOrdered: '10',
            unitPrice: '10',
            currency: 'CAD',
          },
        ],
      },
    }),
  );

  const confirmed = await api.patch(`/v1/orders/${order.id}`, {
    data: { status: 'confirmed' },
  });
  expect(confirmed.ok(), await confirmed.text()).toBeTruthy();

  return { orderId: order.id };
}

test('ships a sale in two parts, by lot, and closes the order', async ({
  page,
  freshOrg,
}) => {
  const { orderId } = await seedSale(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(`/orders/${orderId}`);

  // --- First shipment: the supplement only ----------------------------------
  await page.getByRole('button', { name: 'Ship', exact: true }).click();

  const ship = page.getByRole('dialog');

  // Every outstanding line is offered, prefilled with what is outstanding.
  await expect(ship.getByLabel('Ship E2E-SHIP-FOCUS')).toHaveValue('25.0000');

  // Zero leaves a line for later: partial is the normal case.
  await ship.getByLabel('Ship E2E-SHIP-SCOOP').fill('0');

  await ship.getByLabel('Ship from').click();
  await page.getByRole('option', { name: 'E2E Shelf' }).click();

  /**
   * 25 needed, 20 in each lot: all of the one expiring sooner, then 5 of the
   * later one. Seeing it here means the dialog asked for the preview and
   * rendered what came back.
   */
  await expect(ship).toContainText('EARLY-SHIP');
  await expect(ship).toContainText('20.0000');
  await expect(ship).toContainText('LATE-SHIP');
  await expect(ship).toContainText('5.0000');

  await ship.getByRole('button', { name: 'Ship', exact: true }).click();
  await expect(ship).toBeHidden();
  await expect(page.getByRole('status')).toContainText('Shipped');

  // The shipment is listed with its lots: the packing-slip view.
  const shipments = page
    .getByRole('heading', { name: 'Shipments' })
    .locator('..');
  await expect(shipments).toContainText('EARLY-SHIP');
  await expect(shipments).toContainText('LATE-SHIP');

  // --- Second shipment: what was left behind --------------------------------
  await page.getByRole('button', { name: 'Ship', exact: true }).click();

  const rest = page.getByRole('dialog');
  await expect(rest.getByLabel('Ship E2E-SHIP-SCOOP')).toHaveValue('10.0000');

  await rest.getByLabel('Ship from').click();
  await page.getByRole('option', { name: 'E2E Shelf' }).click();
  await rest.getByRole('button', { name: 'Ship', exact: true }).click();
  await expect(rest).toBeHidden();

  // --- Done: closed, and the stored status reads as Shipped on a sale -----
  // "Close order", not "Mark shipped": shipping is the button above (#24).
  await page.getByRole('button', { name: 'Close order' }).click();

  // Nothing was outstanding, so no close-short confirmation stands between,
  // and a fulfilled order is terminal: neither button that ran remains.
  await expect(page.getByRole('button', { name: 'Close order' })).toBeHidden();
  await expect(
    page.getByRole('button', { name: 'Ship', exact: true }),
  ).toBeHidden();
});
