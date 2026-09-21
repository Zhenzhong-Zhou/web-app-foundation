import { expect, test } from './fixtures';
import { createProduct } from './support/api';

/**
 * Two shapes of test, and they are worth telling apart:
 *
 *   "shows a seeded product"  — seeds over HTTP, asserts in the UI. Depends
 *                               only on the table rendering, so it is the
 *                               pattern to copy for most screens.
 *
 *   "creates a product"       — drives the real form. Slower and tied to the
 *                               markup, so there is exactly one of these per
 *                               screen: the happy path.
 *
 * ROUTES AND SELECTORS ARE ASSUMPTIONS — see the note in auth.spec.ts.
 */

test('shows a product that already exists in the organisation', async ({
  page,
  api,
}) => {
  const product = await createProduct(api, { name: 'E2E Seeded Widget' });

  await page.goto('/products');

  /**
   * Scope the assertion to the row, not the page. `getByText(product.name)`
   * would also match a toast, a heading, or a search box that echoes the
   * query — all of which pass while the table is empty.
   */
  const row = page.getByRole('row', { name: new RegExp(product.name, 'i') });

  await expect(row).toBeVisible();
  // SKU is a variant attribute, not a product one — the products table lists
  // products, so asserting on it here would be asserting the wrong screen.
  await expect(row).toContainText(/good/i);
});

test('creates a product through the form and shows it in the table', async ({
  page,
}) => {
  const name = `E2E Form Widget ${Date.now().toString(36)}`;
  const sku = `SKU-${Date.now().toString(36).toUpperCase()}`;

  await page.goto('/products');
  await page.getByRole('button', { name: /new product|add product/i }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'SKU' }).fill(sku);

  await dialog.getByRole('button', { name: 'Add product' }).click();

  /**
   * No waitForTimeout, and no waiting on the network response either. Web-first
   * assertions retry until the row appears, which is both faster than a fixed
   * sleep and a stronger claim: the data round-tripped *and* rendered.
   *
   * A `waitForTimeout` here is how an e2e suite becomes flaky, gets marked
   * `skip` during a busy week, and is deleted six months later.
   */
  await expect(
    page.getByRole('row', { name: new RegExp(name, 'i') }),
  ).toBeVisible();
});

test("does not show another organisation's products", async ({
  page,
  freshOrg,
}) => {
  const foreign = await createProduct(freshOrg.api, {
    name: 'E2E Foreign Widget',
  });

  // `page` is still the shared owner from global-setup, so this navigates as a
  // different tenant than the one that just created the product.
  await page.goto('/products');

  await expect(page.getByRole('table')).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(foreign.name, 'i') }),
  ).toHaveCount(0);
});
