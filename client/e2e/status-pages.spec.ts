import { expect, test } from './fixtures';
import {
  deploy,
  markDocument,
  openInventory,
  sameDocument,
} from './support/version';

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

/**
 * A page whose chunk won't load says why (ADR-081). The chunk on the dev
 * server is the page's own source file; both it and version.json are the
 * static host's, never the API's, so nothing here mocks the API.
 */
test.describe('a page that won’t load', () => {
  const chunk = '**/src/inventory/inventory-page.tsx*';

  test.beforeEach(async ({ page }) => {
    await page.goto('/orders');
    await expect(
      page.getByRole('heading', { level: 1, name: 'Orders' }),
    ).toBeVisible();
  });

  test('offline: says so, and loads by itself when the connection is back', async ({
    page,
  }) => {
    // The connection dropped: the page's chunk and the version file alike.
    const file = '**/version.json?*';
    await page.route(chunk, (route) => route.abort('internetdisconnected'));
    await page.route(file, (route) => route.abort('internetdisconnected'));

    await openInventory(page);
    await expect(
      page.getByRole('heading', { level: 1, name: "Can't reach the server" }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'This page tries again by itself when your connection comes back.',
      ),
    ).toBeVisible();
    // The rail is still there, so the person is never stranded.
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();

    // The browser says the connection is back: the page loads in full.
    await page.unroute(chunk);
    await page.unroute(file);
    await markDocument(page);
    const loaded = page.waitForEvent('load');
    await page.evaluate(() => window.dispatchEvent(new Event('online')));
    await loaded;

    await expect(
      page.getByRole('heading', { level: 1, name: 'Inventory' }),
    ).toBeVisible();
    expect(await sameDocument(page)).toBeUndefined();
  });

  test('after a deploy: loads in full from the new version, once', async ({
    page,
  }) => {
    // A deploy this tab has not read yet, and the page's chunk out of reach.
    await deploy(page);
    await page.route(chunk, (route) => route.abort('internetdisconnected'));

    await markDocument(page);
    const loaded = page.waitForEvent('load');
    await openInventory(page);
    await loaded;
    expect(await sameDocument(page)).toBeUndefined();
    await expect(page).toHaveURL(/\/inventory$/);

    // Loaded, and the chunk still fails: this time it says so rather than
    // loading again, so it never loops.
    await expect(
      page.getByRole('heading', { level: 1, name: 'A new version is ready' }),
    ).toBeVisible();
    await expect(
      page.getByText(
        'A new version came out while this tab was open. Reload to use it; nothing is lost.',
      ),
    ).toBeVisible();
  });
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
