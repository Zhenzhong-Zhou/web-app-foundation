import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * The text size (ADR-075): a percentage on <html>, so every rem in the app
 * moves with it, kept on this device.
 *
 * Reads and changes only this browser's storage, so it runs beside the
 * rest of the suite on the shared organization.
 */

/** The root's computed size: 16px is Chromium's default, so Standard. */
async function rootSize(page: Page): Promise<string> {
  return page.evaluate(
    () => getComputedStyle(document.documentElement).fontSize,
  );
}

/** True when the page itself scrolls sideways; a table's own scroll is fine. */
async function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth,
  );
}

/** Larger from the first paint, as a device that chose it before opens. */
async function atLarger(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      localStorage.setItem('textSize', 'larger');
    } catch {
      // Storage refused: the spec's own checks then fail and say so.
    }
  });
}

/** Lists that need nothing seeded, each with its own kind of layout. */
const SCREENS = [
  '/',
  '/inventory',
  '/orders',
  '/products',
  '/partners',
  '/account',
  '/settings/organization',
  '/members',
  '/audit',
];

test('the account menu sets the text size, and a reload keeps it', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await rootSize(page)).toBe('16px');

  await page.getByRole('button', { name: /signed in as/ }).click();
  await page.getByRole('combobox', { name: 'Text size' }).click();
  await page.getByRole('option', { name: 'Larger text' }).click();

  expect(await rootSize(page)).toBe('20px');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  expect(await rootSize(page)).toBe('20px');

  // Back to Standard leaves the browser's own size in charge again.
  await page.getByRole('button', { name: /signed in as/ }).click();
  await page.getByRole('combobox', { name: 'Text size' }).click();
  await page.getByRole('option', { name: 'Standard text' }).click();
  expect(await rootSize(page)).toBe('16px');
});

test('the sign-in page offers the text size before signing in', async ({
  browser,
}) => {
  // Its own context, signed out, so the shared session is left alone.
  const context = await browser.newContext({
    storageState: { cookies: [], origins: [] },
  });
  const page = await context.newPage();

  await page.goto('/login');
  await page.getByRole('combobox', { name: 'Text size' }).click();
  await page.getByRole('option', { name: 'Large text' }).click();

  expect(await rootSize(page)).toBe('18px');

  await context.close();
});

test('at Larger, the main screens never scroll sideways on a desktop', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await atLarger(page);

  const wide: string[] = [];
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (await scrollsSideways(page)) wide.push(path);
  }

  // All at once, so one run lists every screen to fix.
  expect(wide).toEqual([]);
});

test('at Larger and 320px wide, the main screens reflow (WCAG 1.4.10)', async ({
  page,
}) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 320, height: 640 });
  await atLarger(page);

  const wide: string[] = [];
  for (const path of SCREENS) {
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    if (await scrollsSideways(page)) wide.push(path);
  }

  expect(wide).toEqual([]);
});
