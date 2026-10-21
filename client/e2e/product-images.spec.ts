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

/**
 * Removing an image can be undone (ADR-062): focus goes to Undo, since the
 * image's menu went with the image, and Undo stays while focus or the
 * pointer is on it, past its five seconds (WCAG 2.2.1).
 */
test('keeps Undo while it has focus, and brings the image back', async ({
  page,
  api,
}) => {
  const product = await createProduct(api);
  await page.goto(`/products/${product.id}`);
  await page.locator('input[type="file"]').setInputFiles({
    name: 'front.png',
    mimeType: 'image/png',
    buffer: PNG,
  });
  const cover = page.getByRole('button', {
    name: `${product.name}, image 1 of 1, the cover`,
    exact: true,
  });
  await expect(cover).toBeVisible();
  const removals: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') removals.push(request.url());
  });

  await page
    .getByRole('button', {
      name: `Options for ${product.name}, image 1 of 1, the cover`,
      exact: true,
    })
    .click();
  await page.getByRole('menuitem', { name: 'Remove', exact: true }).click();
  await expect(cover).toBeHidden();

  const undo = page.getByRole('button', { name: 'Undo', exact: true });
  await expect(undo).toBeFocused();
  await page.waitForTimeout(6_000);
  await expect(undo).toBeVisible();
  expect(removals).toEqual([]);

  await page.keyboard.press('Enter');
  await expect(cover).toBeVisible();
  expect(removals).toEqual([]);
});
