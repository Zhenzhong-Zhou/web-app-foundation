import { expect, test } from './fixtures';
import { createLocation, createProduct } from './support/api';

/**
 * The three movements that start from a pile rather than from a box.
 *
 * Receiving has its own spec because it has its own shape — it asks where
 * something goes. These act on a row that already exists, so the variant, the
 * location, and the lot come from the row and the only question is how many.
 *
 * Quantities are asserted as the strings the server returned. A test that
 * normalised 6.0000 to 6 would be doing the parse ADR-025 forbids in
 * production, and would keep passing if the column became a float.
 */

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

test('ships stock out and reduces the count', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Shippable Widget' });
  const location = await createLocation(api, { name: 'E2E Ship Bay' });

  await receive(api, product.variantId, location.id, '10');

  await page.goto('/inventory');

  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await row.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Ship out' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Quantity').fill('4');
  await dialog.getByRole('button', { name: 'Ship' }).click();

  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toContainText('6.0000');
});

test('refuses to ship more than the shelf holds', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Oversell Widget' });
  const location = await createLocation(api, { name: 'E2E Oversell Bay' });

  await receive(api, product.variantId, location.id, '5');

  await page.goto('/inventory');

  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await row.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Ship out' }).click();

  const dialog = page.getByRole('dialog');
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
  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toContainText('5.0000');
});

test('moves stock between locations without changing the total', async ({
  page,
  api,
}) => {
  const product = await createProduct(api, { name: 'E2E Movable Widget' });
  const from = await createLocation(api, { name: 'E2E Shelf A' });
  const to = await createLocation(api, { name: 'E2E Shelf B' });

  await receive(api, product.variantId, from.id, '40');

  await page.goto('/inventory');

  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await row.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Move' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('To').click();
  await page.getByRole('option', { name: to.name }).click();
  await dialog.getByLabel('Quantity').fill('15');
  await dialog.getByRole('button', { name: 'Move' }).click();

  /**
   * Two rows now, and the total is unchanged. A transfer is one movement
   * touching two cache rows (ADR-023), and this is the first time the
   * deterministic lock ordering in StockService runs from a browser.
   */
  await expect(
    page.getByRole('row', { name: new RegExp(`${product.sku}.*E2E Shelf A`) }),
  ).toContainText('25.0000');
  await expect(
    page.getByRole('row', { name: new RegExp(`${product.sku}.*E2E Shelf B`) }),
  ).toContainText('15.0000');
});

test('corrects a count and requires an explanation', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Miscounted Widget' });
  const location = await createLocation(api, { name: 'E2E Count Bay' });

  await receive(api, product.variantId, location.id, '20');

  await page.goto('/inventory');

  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await row.getByRole('button', { name: /Actions for/ }).click();
  await page.getByRole('menuitem', { name: 'Correct the count' }).click();

  const dialog = page.getByRole('dialog');

  // A receipt explains itself; an adjustment is a person asserting the system
  // is wrong, and a blank one is unauditable (ADR-023). Required in the DTO,
  // in the service, and by a check constraint.
  await expect(dialog.getByLabel('What happened')).toBeVisible();

  await dialog.getByLabel('Difference').fill('3');
  await dialog.getByLabel('What happened').fill('Three broken in the box');
  await dialog.getByRole('button', { name: 'Save correction' }).click();

  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toContainText('17.0000');
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
  await page.getByLabel('Show emptied').click();

  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toContainText('0.0000');
});
