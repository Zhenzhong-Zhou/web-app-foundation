import type { APIRequestContext } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * Return authorizations through the browser (ADR-047): raised from the
 * sale, read on their own page, closed; a replacement raised as a sale at
 * zero; a return that arrived first linked afterwards.
 *
 * Seeded through the API up to a shipped sale: shipping has its own
 * journey. freshOrg, because numbers are asserted from RMA-000001.
 */

/** A confirmed sale that shipped 6 capsules, untracked, from one shelf. */
async function seedShipped(api: APIRequestContext) {
  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'Northside Pharmacy', code: 'NORTH' },
    }),
  );

  const { product } = await created<{
    product: { variants: { id: string }[] };
  }>(
    await api.post('/v1/products', {
      data: { type: 'good', name: 'Focus', variant: { sku: 'FOCUS-60CT' } },
    }),
  );
  const variantId = product.variants[0].id;

  const { location } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', { data: { type: 'site', name: 'Shelf' } }),
  );

  await created(
    await api.post('/v1/stock/movements', {
      data: {
        variantId,
        toLocationId: location.id,
        quantity: '100',
        reason: 'receipt',
      },
    }),
  );

  const { order } = await created<{
    order: { id: string; lines: { id: string }[] };
  }>(
    await api.post('/v1/orders', {
      data: {
        partnerId: partner.id,
        direction: 'sale',
        lines: [
          {
            variantId,
            quantityOrdered: '10',
            unitPrice: '12.50',
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

  await created(
    await api.post(`/v1/orders/${order.id}/shipments`, {
      data: {
        fromLocationId: location.id,
        lines: [{ lineId: order.lines[0].id, quantity: '6' }],
      },
    }),
  );

  return { orderId: order.id, lineId: order.lines[0].id, shelf: location.id };
}

async function seedRma(
  api: APIRequestContext,
  seeded: Awaited<ReturnType<typeof seedShipped>>,
  resolution: 'credit' | 'replace',
) {
  const { returnAuthorization } = await created<{
    returnAuthorization: { id: string };
  }>(
    await api.post('/v1/return-authorizations', {
      data: {
        orderId: seeded.orderId,
        reason: 'Cracked in transit',
        lines: [{ lineId: seeded.lineId, quantity: '2', resolution }],
      },
    }),
  );
  return returnAuthorization.id;
}

test('authorizes a return from the sale, and closes it', async ({
  page,
  freshOrg,
}) => {
  const { orderId } = await seedShipped(freshOrg.api);
  await signInAs(page, freshOrg.api);
  await page.goto(`/orders/${orderId}`);

  await page.getByRole('button', { name: 'Authorize a return' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Why is it coming back').fill('Cracked in transit');
  await dialog.getByLabel('Authorize FOCUS-60CT').fill('2');
  await dialog.getByRole('button', { name: 'Authorize' }).click();

  // Opens the new RMA: authorized, nothing back yet.
  await expect(page.getByRole('heading', { name: 'RMA-000001' })).toBeVisible();
  const row = page.getByRole('row', { name: /FOCUS-60CT/ });
  await expect(row).toContainText('Credit');
  await expect(row).toContainText('2.0000');

  await page.getByRole('button', { name: 'Close RMA' }).click();
  await page.getByRole('button', { name: 'Close it' }).click();

  // Closed, so nothing more is offered under it.
  await expect(page.getByRole('button', { name: 'Close RMA' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Link a return' })).toHaveCount(
    0,
  );
});

test('raises a replacement as a sale at zero', async ({ page, freshOrg }) => {
  const seeded = await seedShipped(freshOrg.api);
  const rmaId = await seedRma(freshOrg.api, seeded, 'replace');

  await signInAs(page, freshOrg.api);
  await page.goto(`/return-authorizations/${rmaId}`);

  await page.getByRole('button', { name: 'Raise replacement' }).click();

  // Straight to the new order, which says what it replaces.
  await expect(page).toHaveURL(/\/orders\/[0-9a-f-]+$/);
  await expect(page.getByText('Replacement for RMA-000001')).toBeVisible();
});

test('links a return that arrived before the RMA', async ({
  page,
  freshOrg,
}) => {
  const seeded = await seedShipped(freshOrg.api);

  // The box came first, unannounced.
  await created(
    await freshOrg.api.post(`/v1/orders/${seeded.orderId}/returns`, {
      data: {
        toLocationId: seeded.shelf,
        lines: [{ lineId: seeded.lineId, quantity: '2' }],
      },
    }),
  );

  const rmaId = await seedRma(freshOrg.api, seeded, 'credit');

  await signInAs(page, freshOrg.api);
  await page.goto(`/return-authorizations/${rmaId}`);

  await page.getByRole('button', { name: 'Link a return' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'Return' }).click();
  await page.getByRole('option', { name: /FOCUS-60CT/ }).click();
  await dialog.getByRole('button', { name: 'Link' }).click();
  await expect(dialog).toBeHidden();

  // Now counted as received against this RMA.
  const row = page.getByRole('row', { name: /FOCUS-60CT/ });
  await expect(row.getByRole('cell').nth(3)).toHaveText('2.0000');
});
