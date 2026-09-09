import { expect, test } from './fixtures';
import { createLocation, createProduct } from './support/api';

/**
 * The end-to-end claim the whole stock layer was built to make: a person types
 * a quantity into a form and the number appears in a table, having crossed the
 * DTO, the ledger, the cache, and back out through a three-table join.
 *
 * Server e2e already proves each piece. What only a browser can prove is that
 * the pieces agree about field names — the class of bug a mocked API cannot
 * catch, because a mock is built from the same assumptions the client is.
 *
 * Setup goes through the API. The variant and the location are not what is
 * under test here, and driving their forms would make this slow and couple it
 * to screens it has no opinion about.
 */

test('receives stock and shows it in the inventory table', async ({
  page,
  api,
}) => {
  const product = await createProduct(api, { name: 'E2E Receivable Widget' });
  const location = await createLocation(api, { name: 'E2E Receiving Bay' });

  await page.goto('/inventory');

  await page.getByRole('button', { name: 'Receive stock' }).click();

  const dialog = page.getByRole('dialog');

  // MUI renders a select as a button that opens a listbox, so each choice is
  // two steps rather than a fill.
  await dialog.getByLabel('Item').click();
  await page.getByRole('option', { name: new RegExp(product.sku) }).click();

  await dialog.getByLabel('Into').click();
  await page.getByRole('option', { name: location.name }).click();

  await dialog.getByLabel('Quantity').fill('40.5');
  await dialog.getByRole('button', { name: 'Receive' }).click();

  /**
   * Asserted as the string the server returned. numeric(18, 4) renders as
   * 40.5000, and a test that normalised that would be doing the parse ADR-025
   * forbids in production — and would keep passing if the column were ever
   * changed to a float.
   */
  const row = page.getByRole('row', { name: new RegExp(product.sku) });

  await expect(row).toBeVisible();
  await expect(row).toContainText('40.5000');
  await expect(row).toContainText(location.name);
});

test('requires a lot for a lot-tracked variant', async ({ page, api }) => {
  const product = await createProduct(api, {
    name: 'E2E Tracked Widget',
    tracksLots: true,
  });
  const location = await createLocation(api, { name: 'E2E Tracked Bay' });

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Receive stock' }).click();

  const dialog = page.getByRole('dialog');

  // Hidden until a lot-tracked item is chosen, because the server refuses a lot
  // on a variant that does not track them and refuses a movement without one on
  // a variant that does (ADR-023).
  await expect(dialog.getByLabel('Lot number')).toBeHidden();

  await dialog.getByLabel('Item').click();
  await page.getByRole('option', { name: new RegExp(product.sku) }).click();

  await expect(dialog.getByLabel('Lot number')).toBeVisible();

  await dialog.getByLabel('Into').click();
  await page.getByRole('option', { name: location.name }).click();

  await dialog.getByLabel('Quantity').fill('12');
  await dialog.getByLabel('Lot number').fill('L2024-A');
  await dialog.getByRole('button', { name: 'Receive' }).click();

  const row = page.getByRole('row', { name: new RegExp(product.sku) });

  await expect(row).toBeVisible();
  await expect(row).toContainText('L2024-A');
  await expect(row).toContainText('12.0000');
});

test('refuses to ship more than the shelf holds', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Oversell Widget' });
  const location = await createLocation(api, { name: 'E2E Oversell Bay' });

  await api.post('/v1/stock/movements', {
    data: {
      variantId: product.variantId,
      toLocationId: location.id,
      quantity: '5',
      reason: 'receipt',
    },
  });

  /**
   * There is no shipping screen yet, so this drives the API and asserts the
   * table rather than a form. It is here because the 409 is the one server
   * behaviour the receiving screen will eventually have to render, and a test
   * that watches the number stay at 5 is the cheapest way to notice if the
   * constraint is ever removed.
   */
  const oversell = await api.post('/v1/stock/movements', {
    data: {
      variantId: product.variantId,
      fromLocationId: location.id,
      quantity: '6',
      reason: 'shipment',
    },
  });

  expect(oversell.status()).toBe(409);

  await page.goto('/inventory');
  const row = page.getByRole('row', { name: new RegExp(product.sku) });
  await expect(row).toContainText('5.0000');
});
