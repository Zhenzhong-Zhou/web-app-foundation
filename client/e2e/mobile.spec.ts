import { expect, test } from './fixtures';

/**
 * The app on a phone's screen and engine (ADR-055): an iPhone's Safari,
 * which every browser on an iPhone is underneath, WeChat's included.
 * Run by the iphone project only (playwright.config.ts).
 *
 * Reads and navigates, and changes nothing, so it can run beside the
 * Chromium suite on the same organization.
 */
test('finds its way round on a phone, through the drawer', async ({ page }) => {
  await page.goto('/inventory');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  // Below 1200px the rail folds into a drawer behind ☰ (ADR-055).
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('link', { name: 'Orders' }).click();

  await expect(
    page.getByRole('heading', { level: 1, name: 'Orders' }),
  ).toBeVisible();
  // Choosing a page closes the drawer.
  await expect(page.getByRole('link', { name: 'Inventory' })).toBeHidden();
});

test('signs in from a phone, with the password shown to check it', async ({
  browser,
}) => {
  // Its own context, signed out, so the shared session is left alone.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByLabel(/^password/i).fill('not-a-real-password');
  await page.getByRole('button', { name: 'Show password' }).click();
  await expect(page.getByLabel(/^password/i)).toHaveValue(
    'not-a-real-password',
  );
  await expect(page.getByLabel(/^password/i)).toHaveAttribute('type', 'text');

  await context.close();
});
