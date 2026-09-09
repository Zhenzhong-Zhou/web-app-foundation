import { expect, test } from './fixtures';
import { createProduct } from './support/api';

/**
 * The one screen where the word "variant" is visible to a person. The create
 * form hides it behind a single SKU field, because a product with one size
 * should not make anyone learn the concept — it becomes real here, when a
 * second size exists.
 *
 * Two write paths, one happy path each. Validation, conflicts, and empty
 * states belong in component tests, where they cost milliseconds rather than
 * seconds.
 */

test('adds a second variant to an existing product', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Multi-size Widget' });

  await page.goto(`/products/${product.id}`);
  await page.getByRole('button', { name: 'Add variant' }).click();

  const dialog = page.getByRole('dialog');
  const sku = `${product.sku}-XL`;

  await dialog.getByLabel('SKU').fill(sku);
  await dialog.getByLabel('Size or variation').fill('Extra large');
  await dialog.getByRole('button', { name: 'Add variant' }).click();

  await expect(page.getByRole('row', { name: new RegExp(sku) })).toBeVisible();

  // The original survives. ADR-023's whole point is that these are two rows
  // under one product, not a replacement.
  await expect(
    page.getByRole('row', { name: new RegExp(`${product.sku}(?!-XL)`) }),
  ).toBeVisible();
});

test('renames a SKU inline', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Typo Widget' });
  const corrected = `${product.sku}-FIXED`;

  await page.goto(`/products/${product.id}`);

  /**
   * The SKU is edited in the cell, not in the Edit dialog — that dialog covers
   * size, unit, and dimensions. The split is deliberate: the SKU is the one
   * field with a uniqueness constraint behind it.
   *
   * Editable at all because ADR-023 chose that over locking: a typo found
   * after the first receipt would otherwise be permanent, and the workaround
   * people reach for is a duplicate product that splits stock across two
   * records.
   *
   * Committed on blur rather than by a save control, so the cell has no way to
   * abandon an edit once started. Surprising, and this test breaks loudly if
   * it ever changes.
   */
  const row = page.getByRole('row', { name: new RegExp(product.sku) });

  // The cell is a button showing the SKU; clicking it swaps in the input.
  await row.getByRole('button', { name: product.sku }).click();
  await row.getByRole('textbox').fill(corrected);

  // Committed on blur — there is no save control. That is worth knowing: the
  // edit cannot be abandoned once started, which is fine for a field only
  // touched to fix a typo, and this test breaks loudly if it ever changes.
  await row.getByRole('textbox').blur();

  await expect(
    page.getByRole('row', { name: new RegExp(corrected) }),
  ).toBeVisible();
});

test('edits a variant through the dialog', async ({ page, api }) => {
  const product = await createProduct(api, { name: 'E2E Dimensioned Widget' });

  await page.goto(`/products/${product.id}`);
  await page
    .getByRole('row', { name: new RegExp(product.sku) })
    .getByRole('button', { name: 'Edit' })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Size or variation').fill('Large');
  await dialog.getByRole('button', { name: 'Save' }).click();

  await expect(
    page.getByRole('row', { name: new RegExp(product.sku) }),
  ).toContainText('Large');
});
