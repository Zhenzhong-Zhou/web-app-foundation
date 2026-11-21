import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  createLocation,
  createProduct,
  type SeededProduct,
} from './support/api';

/**
 * Stock's actions on a row that already exists: the variant, the location
 * and the lot come from the row, and the only question is how many.
 * Receiving has its own spec because it has the opposite shape: it asks
 * where something goes. The movements page, which reads the ledger whole,
 * is movements-page.spec.ts.
 *
 * The inventory shows quantities to read, "6 each" (displayQuantity,
 * ADR-055): the server's string trimmed and grouped, never parsed, so a
 * column turned float would still show here as its digits changed. Each is
 * matched as its whole cell, since "6 each" is inside "16 each".
 */

/**
 * A row's whole cell holding exactly this text, such as "6 each": the
 * first, On hand, on a code's row, where Free beside it may say the same.
 */
function cellOf(page: Page, row: RegExp, text: string) {
  return page
    .getByRole('row', { name: row })
    .getByRole('cell', { name: text, exact: true })
    .first();
}

async function receive(
  api: Parameters<typeof createProduct>[0],
  variantId: string,
  locationId: string,
  quantity: string,
) {
  const response = await api.post('/v1/stock/movements', {
    data: { variantId, toLocationId: locationId, quantity, reason: 'receipt' },
  });

  if (!response.ok()) {
    throw new Error(`Receipt failed: ${response.status()}`);
  }
}

/**
 * Opens a code's row to its places on the inventory screen (ADR-093), then
 * the menu of its pile at a place, and picks an action.
 */
async function rowAction(
  page: Page,
  product: SeededProduct,
  location: string,
  action: string,
) {
  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await row.getByRole('button', { name: /show where/ }).click();
  await page
    .getByRole('button', { name: `Actions for ${product.name} at ${location}` })
    .click();
  // Exactly: one choice's words, never another's.
  await page.getByRole('menuitem', { name: action, exact: true }).click();
  return page.getByRole('dialog');
}

test('ships stock out and reduces the count', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Shippable Widget' });
  const location = await createLocation(api, { name: 'E2E Ship Bay' });

  await receive(api, product.variantId, location.id, '10');

  await page.goto('/inventory');

  const dialog = await rowAction(page, product, location.name, 'Ship out…');
  await dialog.getByLabel('Quantity').fill('4');
  await dialog.getByRole('button', { name: 'Ship' }).click();

  await expect(cellOf(page, new RegExp(product.sku), '6 each')).toBeVisible();
});

test('refuses to ship more than the shelf holds', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Oversell Widget' });
  const location = await createLocation(api, { name: 'E2E Oversell Bay' });

  await receive(api, product.variantId, location.id, '5');

  await page.goto('/inventory');

  const dialog = await rowAction(page, product, location.name, 'Ship out…');
  await dialog.getByLabel('Quantity').fill('6');
  await dialog.getByRole('button', { name: 'Ship' }).click();

  /**
   * The 409 from stock_levels_quantity_non_negative_check, rendered. The
   * constraint is what makes this correct and the message is what makes it
   * useful — this is the only test that proves the second half.
   */
  await expect(dialog.getByRole('alert', { name: 'Error' })).toContainText(
    /not enough stock/i,
  );

  // Nothing moved. A ledger row for a shipment that did not happen is worse
  // than no row.
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(cellOf(page, new RegExp(product.sku), '5 each')).toBeVisible();
});

test('moves stock between locations without changing the total', async ({
  page,
  api,
}) => {
  const product = await createProduct(api, { name: 'E2E Movable Widget' });
  // Places named for this run: the shared organization keeps every run's
  // places, so a fixed name is two options by the second (--repeat-each).
  const from = await createLocation(api);
  const to = await createLocation(api);

  await receive(api, product.variantId, from.id, '40');

  await page.goto('/inventory');

  const dialog = await rowAction(page, product, from.name, 'Move…');
  await dialog.getByLabel('To').click();
  await page.getByRole('option', { name: to.name }).click();
  await dialog.getByLabel('Quantity').fill('15');
  await dialog.getByRole('button', { name: 'Move' }).click();

  /**
   * Two places now, and the total is unchanged. A transfer is one movement
   * touching two cache rows (ADR-023), and this is the first time the
   * deterministic lock ordering in StockService runs from a browser. The
   * opened row reads its places again once stock has moved.
   */
  await expect(cellOf(page, new RegExp(product.sku), '40 each')).toBeVisible();
  await expect(cellOf(page, new RegExp(from.name), '25 each')).toBeVisible();
  await expect(cellOf(page, new RegExp(to.name), '15 each')).toBeVisible();
});

test('corrects a count and requires an explanation', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Miscounted Widget' });
  const location = await createLocation(api, { name: 'E2E Count Bay' });

  await receive(api, product.variantId, location.id, '20');

  await page.goto('/inventory');

  const dialog = await rowAction(
    page,
    product,
    location.name,
    'Correct the count…',
  );

  // A receipt explains itself; an adjustment is a person asserting the system
  // is wrong, and a blank one is unauditable (ADR-023). Required in the DTO,
  // in the service, and by a check constraint.
  await expect(dialog.getByLabel('What happened')).toBeVisible();

  await dialog.getByLabel('Difference').fill('3');
  await dialog.getByLabel('What happened').fill('Three broken in the box');
  await dialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(cellOf(page, new RegExp(product.sku), '17 each')).toBeVisible();
});

test('shows emptied rows when asked', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Emptied Widget' });
  const location = await createLocation(api, { name: 'E2E Emptied Bay' });

  await receive(api, product.variantId, location.id, '5');
  await api.post('/v1/stock/movements', {
    data: {
      variantId: product.variantId,
      fromLocationId: location.id,
      quantity: '5',
      reason: 'shipment',
    },
  });

  await page.goto('/inventory');

  // Hidden by default: "what is on this shelf" means what is there.
  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toHaveCount(0);

  /**
   * The row is kept at zero, never deleted, and its movements are the only
   * record of where the stock went — so it has to be reachable. Two fetches
   * racing here would leave the toggle looking dead.
   */
  // A quick filter on the inventory's filter row (ADR-055).
  await page.getByRole('button', { name: 'Show emptied' }).click();

  await expect(cellOf(page, new RegExp(product.sku), '0 each')).toBeVisible();
});
