import { expect, test } from './fixtures';
import { createLocation, createProduct, signInAs } from './support/api';

/**
 * Read-only, so there is nothing to drive. What is worth proving is that the
 * log records something a person just did, and that "Load more" appends rather
 * than replaces — offset paging repeats rows as new entries arrive at the head,
 * which is exactly why ADR-018 chose a keyset cursor and why the button says
 * "Load more" rather than showing page numbers.
 */

test('records an action taken through the UI', async ({ page, freshOrg }) => {
  await signInAs(page, freshOrg.api);

  await page.goto('/locations');
  await page.getByRole('button', { name: 'Add location' }).click();

  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('Name').fill('E2E Audited Site');
  await dialog.getByRole('button', { name: 'Add location' }).click();

  await expect(page.getByText('E2E Audited Site')).toBeVisible();

  /**
   * The interceptor firing on a real request is the thing under test. A server
   * test can assert the row exists; only this proves the decorator is actually
   * on the route the client calls.
   */
  await page.goto('/audit');

  const row = page.getByRole('row', { name: /location/i }).first();
  await expect(row).toBeVisible();
  await expect(row).toContainText(freshOrg.email);
});

test('appends rather than replaces when paging', async ({ page, freshOrg }) => {
  /**
   * Twenty-six actions, one past the page size, so a second page exists with a
   * single row on it. Seeded over HTTP — driving the form twenty-six times
   * would take a minute and prove nothing extra.
   */
  const product = await createProduct(freshOrg.api, { name: 'E2E Paged' });
  const location = await createLocation(freshOrg.api, {
    name: 'E2E Paged Bay',
  });

  for (let i = 0; i < 26; i += 1) {
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '1',
        reason: 'receipt',
      },
    });
  }

  await signInAs(page, freshOrg.api);
  await page.goto('/audit');

  const rows = page.getByRole('row');
  const firstPage = await rows.count();

  await page.getByRole('button', { name: 'Load more' }).click();

  // Strictly more, not the same count with different contents. A cursor that
  // refetched from the head would leave this equal.
  await expect(rows).not.toHaveCount(firstPage);
  expect(await rows.count()).toBeGreaterThan(firstPage);
});

test('tells a Viewer they cannot read it, without pretending otherwise', async ({
  page,
  viewerApi,
}) => {
  /**
   * Cleared first: the page arrives with the shared owner's sid from
   * storageState, and adding a second cookie of the same name for the same
   * host leaves it unspecified which one the browser sends.
   */
  await page.context().clearCookies();
  await signInAs(page, viewerApi);

  await page.goto('/audit');

  /**
   * A heading promising "every change made in this organization" above a
   * message saying you may not see it is two contradictory claims on one
   * screen, which is why the 403 gets its own state rather than an alert under
   * the usual description.
   */
  await expect(page.getByText(/role does not include access/i)).toBeVisible();

  await expect(page.getByRole('table')).toHaveCount(0);
  await expect(
    page.getByText(/every change made in this organization/i),
  ).toHaveCount(0);
});
