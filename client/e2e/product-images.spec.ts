import { expect, test } from './fixtures';
import { createProduct } from './support/api';

/** A 2 × 2 PNG, as small as a valid photo gets. */
const PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGPQyNsCRAwQCgAh9gUpSr06YAAAAABJRU5ErkJggg==',
  'base64',
);

/**
 * A product's gallery (ADR-062): an image added from the product page is
 * its cover, shown beside its name in the Products list.
 */
test('adds an image that becomes the cover in the list', async ({
  page,
  api,
}) => {
  const product = await createProduct(api);

  await page.goto(`/products/${product.id}`);
  await expect(
    page.getByText('Drag photos here', { exact: true }),
  ).toBeVisible();

  await page.locator('input[type="file"]').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: PNG,
  });

  await expect(
    page.getByRole('button', {
      name: `${product.name}, image 1 of 1, the cover`,
      exact: true,
    }),
  ).toBeVisible();

  await page.goto('/products');
  await expect(page.getByRole('img', { name: product.name })).toBeVisible();
});
