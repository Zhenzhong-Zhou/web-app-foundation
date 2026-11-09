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
  // Its own name each run, so the suite run again, or --repeat-each, finds
  // one row rather than every run's.
  const product = await createProduct(api, {
    name: `E2E Seeded Widget ${Date.now().toString(36)}`,
  });

  // Searched, so it is on the first fifty however many runs have added
  // before it (ADR-092).
  await page.goto(`/items?search=${encodeURIComponent(product.name)}`);

  /**
   * Scope the assertion to the row, not the page. `getByText(product.name)`
   * would also match a toast, a heading, or a search box that echoes the
   * query — all of which pass while the table is empty.
   */
  const row = page.getByRole('row', { name: new RegExp(product.name, 'i') });

  await expect(row).toBeVisible();
  // Its code in grey under its name, and on the Products tab, its type's
  // (ADR-092).
  await expect(row).toContainText(product.sku);
  await expect(
    page.getByRole('tab', { name: /^Products/, selected: true }),
  ).toBeVisible();
});

test('creates a product through the form and shows it in the table', async ({
  page,
}) => {
  // Its own each run: two repeats in parallel can share a millisecond, and
  // the second's code would then be refused as in use.
  const unique = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const name = `E2E Form Widget ${unique}`;
  const sku = `SKU-${unique.toUpperCase()}`;

  await page.goto('/items');
  await page.getByRole('button', { name: 'Add item', exact: true }).click();

  const dialog = page.getByRole('dialog');
  // What it is first; the Products tab has chosen it already (ADR-092).
  await expect(dialog.getByRole('radio', { name: /^Products/ })).toBeChecked();
  await dialog.getByRole('textbox', { name: 'Name', exact: true }).fill(name);
  await dialog.getByRole('textbox', { name: 'Code' }).fill(sku);

  await dialog.getByRole('button', { name: 'Add item' }).click();

  /**
   * No waitForTimeout, and no waiting on the network response either. Web-first
   * assertions retry until the page appears, which is both faster than a fixed
   * sleep and a stronger claim: the data round-tripped *and* rendered.
   *
   * A `waitForTimeout` here is how an e2e suite becomes flaky, gets marked
   * `skip` during a busy week, and is deleted six months later.
   *
   * The new item's page takes the form's place, so Back returns to Items,
   * searched for there, so it is on the first fifty (ADR-092).
   */
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  await page.goBack();
  await page
    .getByRole('searchbox', { name: 'Search by name or code' })
    .fill(name);
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
  await page.goto('/items');

  await expect(page.getByRole('table')).toBeVisible();
  await expect(
    page.getByRole('row', { name: new RegExp(foreign.name, 'i') }),
  ).toHaveCount(0);
});
