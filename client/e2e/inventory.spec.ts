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
  // A place named for this run: the shared organization keeps every run's
  // places, so a fixed name is two options by the second (--repeat-each).
  const location = await createLocation(api);

  await page.goto('/inventory');

  // The header's; a first use's empty list offers it too (ADR-093).
  await page.getByRole('button', { name: 'Receive stock' }).first().click();

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
   * The server's 40.5000, read without padding zeros (displayQuantity,
   * ADR-055): trimmed as text, never parsed, so a column turned float would
   * still show here as its digits changed. Matched as the whole cell, since
   * "40.5 each" is inside "140.5 each"; On hand is the first, Free the
   * same beside it. A row per code (ADR-093) opens to where it is.
   */
  const row = page.getByRole('row', { name: new RegExp(product.sku) });

  await expect(row).toBeVisible();
  await expect(
    row.getByRole('cell', { name: '40.5 each', exact: true }).first(),
  ).toBeVisible();
  await row.getByRole('button', { name: /^1 place: show where/ }).click();
  await expect(
    page.getByRole('row', { name: new RegExp(location.name) }),
  ).toBeVisible();
});

test('requires a lot for a lot-tracked variant', async ({ page, api }) => {
  const product = await createProduct(api, {
    name: 'E2E Tracked Widget',
    tracksLots: true,
  });
  const location = await createLocation(api);

  await page.goto('/inventory');
  await page.getByRole('button', { name: 'Receive stock' }).first().click();

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
  await expect(
    row.getByRole('cell', { name: '12 each', exact: true }).first(),
  ).toBeVisible();
  // Its place, then the place's lot, a link to its trace (ADR-093, R2).
  await row.getByRole('button', { name: /^1 place: show where/ }).click();
  await page
    .getByRole('button', { name: `1 lot: show the lots at ${location.name}` })
    .click();
  await expect(page.getByRole('link', { name: 'L2024-A' })).toBeVisible();
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
  await expect(
    row.getByRole('cell', { name: '5 each', exact: true }).first(),
  ).toBeVisible();
});

// Out has no lots to list (ADR-093, 31a): said, with the way back.
test('says items that are out have no lots, with Group by Item', async ({
  page,
}) => {
  await page.goto('/inventory?out=1');
  await page.getByRole('button', { name: 'Lot', exact: true }).click();

  await expect(page).toHaveURL(/group=lot/);
  await expect(
    page.getByText('Items that are out have no lots.'),
  ).toBeVisible();

  await page.getByRole('button', { name: 'Group by Item' }).click();
  await expect(page).not.toHaveURL(/group=lot/);
  await expect(page.getByRole('button', { name: /^Out/ })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
});
