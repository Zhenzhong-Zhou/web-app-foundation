import { expect, test } from './fixtures';

/**
 * Status pages (conventions.md): an unknown address and a record that does
 * not exist each say so inside the app, with a way on, instead of a bare
 * heading or the server's raw error.
 */
test('an unknown address shows Page not found inside the app', async ({
  page,
}) => {
  await page.goto('/no-such-page');

  await expect(
    page.getByRole('heading', { level: 1, name: 'Page not found' }),
  ).toBeVisible();
  // The rail is still there, so the person is never stranded.
  await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

  await page.getByRole('link', { name: 'Go home' }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('an order that does not exist says so, with the way to Orders', async ({
  page,
}) => {
  await page.goto('/orders/00000000-0000-7000-8000-000000000000');

  await expect(
    page.getByRole('heading', { level: 1, name: "This order doesn't exist" }),
  ).toBeVisible();
  await page.getByRole('link', { name: 'Go to Orders' }).click();
  await expect(page).toHaveURL(/\/orders$/);
});

test.describe('signed out', () => {
  test.use({ storageState: { cookies: [], origins: [] } });

  test('an unknown address offers Sign in, on its own', async ({ page }) => {
    await page.goto('/no-such-page');

    await expect(
      page.getByRole('heading', { level: 1, name: 'Page not found' }),
    ).toBeVisible();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(page.getByRole('link', { name: 'Sign in' })).toBeVisible();
  });
});
