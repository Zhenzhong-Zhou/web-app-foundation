import { expect, test } from './fixtures';
import { createCategory, createProduct, signInAs } from './support/api';

/**
 * Settings › Categories (ADR-092), its row of the interaction table, named
 * by its words: a category that holds something is refused at its row, on
 * the screen, before anything is sent. The server's own refusal of the same
 * delete is server/test/product-categories.e2e-spec.ts's. The rest of
 * Items' rows are items.spec.ts's; axe on this screen, accessibility.spec.ts.
 */

test('Settings › Categories, Delete with items under it: refused, how many, and to move them first', async ({
  page,
  freshOrg,
}) => {
  const vitamins = await createCategory(freshOrg.api, 'Vitamins');
  await createCategory(freshOrg.api, 'Vitamin C', vitamins);
  await createProduct(freshOrg.api, {
    name: 'E2E Multi',
    categoryId: vitamins,
  });
  await signInAs(page, freshOrg.api);
  await page.goto('/settings/categories');

  const deletes: string[] = [];
  page.on('request', (request) => {
    if (request.method() === 'DELETE') deletes.push(request.url());
  });

  await page.getByRole('button', { name: 'Actions for Vitamins' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();

  await expect(
    page.getByText(
      'Vitamins still holds 1 item and 1 category. Move what is in it to another category first, then delete Vitamins.',
    ),
  ).toBeVisible();
  // Nothing asked, nothing sent, and it is still there.
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(deletes).toEqual([]);
  await expect(page).toHaveURL(/\/settings\/categories$/);
  await expect(page.getByText('Vitamins', { exact: true })).toBeVisible();

  // An empty one: the same Delete asks first, then deletes.
  await page.getByRole('button', { name: 'Actions for Vitamin C' }).click();
  await page.getByRole('menuitem', { name: 'Delete' }).click();
  const confirm = page.getByRole('dialog', { name: 'Delete Vitamin C?' });
  await confirm.getByRole('button', { name: 'Delete category' }).click();
  await expect(page.getByText('Deleted Vitamin C.')).toBeVisible();
  await expect(page.getByText('Vitamin C', { exact: true })).toHaveCount(0);
});

test('Settings › Categories for a Viewer: the tree to read, with no Actions', async ({
  page,
  viewerApi,
  api,
}) => {
  const name = `E2E Shelf ${Date.now().toString(36)}`;
  await createCategory(api, name);
  await signInAs(page, viewerApi);
  await page.goto('/settings/categories');

  await expect(page.getByText(name, { exact: true })).toBeVisible();
  await expect(
    page.getByText(/^Your role does not include changing categories\./),
  ).toBeVisible();
  await expect(page.getByRole('button', { name: /^Actions for / })).toHaveCount(
    0,
  );
  await expect(page.getByRole('button', { name: 'Add category' })).toHaveCount(
    0,
  );
});
