import { expect, test } from './fixtures';
import { createLocation, createProduct, signInAs } from './support/api';

/**
 * The screen exists to make ADR-024's rule visible rather than something people
 * meet by being refused: stock sits in the places that contain nothing else,
 * and leaf-ness is computed from children rather than declared.
 *
 * So the assertions are mostly about the chip moving. That is the invariant
 * rendered, and the cheapest thing to get wrong in a refactor.
 */

test('adds a site and shows it as holding stock', async ({
  page,
  freshOrg,
}) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/locations');
  await page.getByRole('button', { name: 'Add location' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Main Site');
  await dialog.getByLabel('Code').fill('E2E-1');
  await dialog.getByRole('button', { name: 'Add location' }).click();

  const site = page.getByText('E2E Main Site').locator('..');

  await expect(page.getByText('E2E Main Site')).toBeVisible();

  // A single room is a location in its own right. An operation that has not
  // divided anything up still gets somewhere to put stock.
  await expect(site.getByText('Holds stock')).toBeVisible();
});

test('moves the stock chip to the child when one is added', async ({
  page,
  freshOrg,
}) => {
  const site = await createLocation(freshOrg.api, { name: 'E2E Parent Site' });

  await signInAs(page, freshOrg.api);

  await page.goto('/locations');

  const parentRow = page.getByText(site.name).locator('..');
  await expect(parentRow.getByText('Holds stock')).toBeVisible();

  await parentRow.getByRole('button', { name: 'Add inside' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Bin 1');
  await dialog.getByRole('button', { name: 'Add location' }).click();

  await expect(page.getByText('E2E Bin 1')).toBeVisible();

  /**
   * The whole point. The parent stops being a leaf the moment it gains a child,
   * with nothing having been declared — and the screen has to say so, because
   * the alternative is someone discovering it when a receipt is refused.
   */
  await expect(parentRow.getByText('Holds stock')).toBeHidden();
  await expect(
    page.getByText('E2E Bin 1').locator('..').getByText('Holds stock'),
  ).toBeVisible();
});

test('refuses a child under a location holding stock', async ({
  page,
  freshOrg,
}) => {
  const site = await createLocation(freshOrg.api, {
    name: 'E2E Occupied Site',
  });
  const product = await createProduct(freshOrg.api, { name: 'E2E Blocker' });

  await freshOrg.api.post('/v1/stock/movements', {
    data: {
      variantId: product.variantId,
      toLocationId: site.id,
      quantity: '10',
      reason: 'receipt',
    },
  });

  await signInAs(page, freshOrg.api);

  await page.goto('/locations');
  await page
    .getByText(site.name)
    .locator('..')
    .getByRole('button', { name: 'Add inside' })
    .click();

  const dialog = page.getByRole('dialog');

  // Said before the attempt, not after: being refused once a name has been
  // typed is worse than being told what will happen.
  await expect(dialog).toContainText('has to move into a child location first');

  await dialog.getByLabel('Name').fill('E2E Doomed Bin');
  await dialog.getByRole('button', { name: 'Add location' }).click();

  // The server is what actually enforces it — the warning above is courtesy.
  await expect(dialog.getByRole('alert', { name: 'Error' })).toContainText(
    /holds stock/i,
  );
  await expect(page.getByText('E2E Doomed Bin')).toBeHidden();
});

test('does not offer a location its own descendants as a parent', async ({
  page,
  api,
}) => {
  const site = await createLocation(api, { name: `E2E Tree ${Date.now()}` });
  const bin = await createLocation(api, {
    name: `E2E Tree Bin ${Date.now()}`,
    type: 'bin',
    parentId: site.id,
  });

  await page.goto('/locations');
  await page
    .getByText(site.name)
    .locator('..')
    .getByRole('button', { name: 'Edit' })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Inside').click();

  /**
   * Moving a location under its own child detaches the whole subtree — every
   * row still present, none reachable from a root. The server refuses it by
   * walking the chain (ADR-024); the picker does the same walk so the option
   * never appears.
   */
  await expect(page.getByRole('option', { name: bin.name })).toHaveCount(0);
  await expect(page.getByRole('option', { name: 'Top level' })).toBeVisible();
});

test('moves a location back to the top level', async ({ page, api }) => {
  const site = await createLocation(api, { name: `E2E Root ${Date.now()}` });
  const bin = await createLocation(api, {
    name: `E2E Promoted ${Date.now()}`,
    type: 'bin',
    parentId: site.id,
  });

  await page.goto('/locations');
  await page
    .getByText(bin.name)
    .locator('..')
    .getByRole('button', { name: 'Edit' })
    .click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Inside').click();
  await page.getByRole('option', { name: 'Top level' }).click();
  const response = page.waitForResponse(
    (res) =>
      res.url().includes('/locations/') && res.request().method() === 'PATCH',
  );
  await dialog.getByRole('button', { name: 'Save' }).click();

  const patch = await response;
  expect(patch.status()).toBe(204);
  // The bug this test exists for: JSON.stringify drops undefined keys, so a
  // parentId that is undefined rather than null leaves the parent unchanged
  // and the request still succeeds.
  expect(JSON.parse(patch.request().postData() ?? '{}')).toHaveProperty(
    'parentId',
    null,
  );

  /**
   * parentId sends null, not undefined. JSON.stringify drops undefined keys,
   * and UpdateLocationDto reads the two differently — undefined leaves the
   * parent alone. Getting it backwards makes this silently do nothing, which
   * is what this asserts against: the old parent gets its chip back.
   */
  await expect(
    page.getByText(site.name).locator('..').getByText('Holds stock'),
  ).toBeVisible();
});
