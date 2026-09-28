import type { APIRequestContext, APIResponse } from '@playwright/test';

import { expect, test } from './fixtures';
import { created, signInAs } from './support/api';

/**
 * ADR-048 end to end in a browser: a priced purchase lands with a value, a
 * run consumes it and closes, and the batch shows what it cost; stock with
 * no price waits on the Stock value page until someone sets one; a rate is
 * entered on its own page.
 *
 * Seeded through the API, read and acted on through the UI, as the
 * production flow is. freshOrg, because the waiting list must start empty.
 */

async function ok(response: APIResponse) {
  expect(response.ok(), await response.text()).toBeTruthy();
}

/**
 * A blend at 38 a kilo and bottles at 0.10 bought on a purchase order, a
 * recipe of 30 kg and 1000 bottles, and a run for 1000 released, 980 made
 * and closed: 1240.00 of material, 1.2653 a bottle.
 */
async function seedClosedRun(api: APIRequestContext) {
  await ok(
    await api.patch('/v1/organization', { data: { baseCurrency: 'CAD' } }),
  );

  const { location: site } = await created<{ location: { id: string } }>(
    await api.post('/v1/locations', {
      data: { type: 'site', name: 'E2E Cost Plant' },
    }),
  );

  const bin = async (name: string, code: string) =>
    (
      await created<{ location: { id: string } }>(
        await api.post('/v1/locations', {
          data: { type: 'bin', name, code, parentId: site.id },
        }),
      )
    ).location.id;

  const shelf = await bin('E2E Cost Shelf', 'E2E-C-SHELF');
  const blending = await bin('E2E Cost Blending', 'E2E-C-BLEND');

  const variantOf = async (
    sku: string,
    type: string,
    unit: string,
    tracksLots: boolean,
  ) =>
    (
      await created<{ product: { variants: { id: string }[] } }>(
        await api.post('/v1/products', {
          data: {
            type,
            name: sku,
            variant: { sku, unitOfMeasure: unit, tracksLots },
          },
        }),
      )
    ).product.variants[0].id;

  const output = await variantOf('E2E-C-FOCUS', 'good', 'each', true);
  const blend = await variantOf('E2E-C-BLEND', 'material', 'kg', true);
  const bottle = await variantOf('E2E-C-BOTTLE', 'packaging', 'each', false);

  const { partner } = await created<{ partner: { id: string } }>(
    await api.post('/v1/partners', {
      data: { name: 'E2E Cost Supplier', code: 'E2E-C-SUP' },
    }),
  );

  const buy = async (
    variantId: string,
    quantity: string,
    unitPrice: string,
    lot?: { code: string },
  ) => {
    const { order } = await created<{
      order: { id: string; lines: { id: string }[] };
    }>(
      await api.post('/v1/orders', {
        data: {
          partnerId: partner.id,
          direction: 'purchase',
          lines: [
            {
              variantId,
              quantityOrdered: quantity,
              unitPrice,
              currency: 'CAD',
            },
          ],
        },
      }),
    );

    await ok(
      await api.patch(`/v1/orders/${order.id}`, {
        data: { status: 'confirmed' },
      }),
    );

    await created(
      await api.post(
        `/v1/orders/${order.id}/lines/${order.lines[0].id}/receipts`,
        { data: { toLocationId: shelf, quantity, lot } },
      ),
    );
  };

  await buy(blend, '50', '38', { code: 'E2E-C-BF' });
  await buy(bottle, '1000', '0.10');

  const { bom } = await created<{ bom: { id: string } }>(
    await api.post('/v1/boms', {
      data: {
        outputVariantId: output,
        outputQuantity: '1000',
        lines: [
          { componentVariantId: blend, quantity: '30' },
          { componentVariantId: bottle, quantity: '1000' },
        ],
      },
    }),
  );
  await ok(await api.post(`/v1/boms/${bom.id}/promote`));

  const { productionOrder: run } = await created<{
    productionOrder: { id: string };
  }>(
    await api.post('/v1/production-orders', {
      data: {
        outputVariantId: output,
        bomId: bom.id,
        locationId: blending,
        quantityPlanned: '1000',
      },
    }),
  );

  await ok(
    await api.post(`/v1/production-orders/${run.id}/release`, {
      data: { sourceLocationId: shelf },
    }),
  );
  await created(
    await api.post(`/v1/production-orders/${run.id}/output`, {
      data: { quantity: '980', lot: { code: 'E2E-C-FOC-1' } },
    }),
  );
  await ok(
    await api.post(`/v1/production-orders/${run.id}/close`, { data: {} }),
  );

  return { runId: run.id, shelf };
}

test('shows what a batch cost, and clears a receipt waiting for one', async ({
  page,
  freshOrg,
}) => {
  const { runId, shelf } = await seedClosedRun(freshOrg.api);
  await signInAs(page, freshOrg.api);

  // --- The batch -------------------------------------------------------------
  await page.goto(`/production/${runId}`);

  await expect(
    page.getByRole('heading', { name: 'Cost', exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/1,240\.00/).first()).toBeVisible();
  await expect(page.getByText(/1\.2653/)).toBeVisible();
  await expect(page.getByRole('table', { name: 'What it used' })).toContainText(
    'E2E-C-BF',
  );

  // --- Something received with no price -------------------------------------
  const lid = (
    await created<{ product: { variants: { id: string }[] } }>(
      await freshOrg.api.post('/v1/products', {
        data: {
          type: 'packaging',
          name: 'E2E-C-LID',
          variant: { sku: 'E2E-C-LID', unitOfMeasure: 'each' },
        },
      }),
    )
  ).product.variants[0].id;

  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: lid,
        toLocationId: shelf,
        quantity: '5',
        reason: 'receipt',
      },
    }),
  );

  await page.goto('/costs');

  const waitingRow = page.getByRole('row', { name: /E2E-C-LID/ }).first();
  await expect(waitingRow).toContainText('Received with no price');

  await waitingRow
    .getByRole('button', { name: 'Set cost', exact: true })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Unit price', exact: true })
    .fill('2');

  const [saved] = await Promise.all([
    page.waitForResponse(
      (response) =>
        response.request().method() === 'PUT' &&
        new URL(response.url()).pathname.includes('/v1/costs/valuations/'),
    ),
    dialog.getByRole('button', { name: 'Set cost', exact: true }).click(),
  ]);
  expect(saved.ok(), await saved.text()).toBeTruthy();

  await expect(page.getByText('Everything on hand has a cost.')).toBeVisible();

  // --- The batch's lot, from the valuation list ------------------------------
  await page.getByRole('link', { name: 'E2E-C-FOC-1', exact: true }).click();

  await expect(page.getByText('Batch cost at close')).toBeVisible();
  await expect(page.getByText(/1\.2653/)).toBeVisible();
});

test('enters an exchange rate', async ({ page, freshOrg }) => {
  await ok(
    await freshOrg.api.patch('/v1/organization', {
      data: { baseCurrency: 'CAD' },
    }),
  );
  await signInAs(page, freshOrg.api);

  await page.goto('/settings/exchange-rates');
  await page.getByRole('button', { name: 'Set a rate', exact: true }).click();

  const dialog = page.getByRole('dialog');
  await dialog
    .getByRole('textbox', { name: 'Currency', exact: true })
    .fill('usd');
  await dialog.getByRole('textbox', { name: 'Rate', exact: true }).fill('1.37');
  await dialog.getByRole('button', { name: 'Save rate', exact: true }).click();

  const row = page.getByRole('row', { name: /USD/ });
  await expect(row).toContainText('1.37');
  await expect(row).not.toContainText('1.37000000');
});
