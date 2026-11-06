import { expect, test } from './fixtures';

/** Production's list, the read its screen sends as it first draws. */
const isTheList = (url: URL) => url.pathname === '/api/v1/production-orders';

/**
 * The top loading bar (ADR-091, #431): a tap inside the app shows it at
 * once, under the top bar, until the next screen's code and its first
 * read have landed; the old screen stays meanwhile, as it did with nothing
 * to say so. Here the next screen's read is held for a second and a half,
 * as Slow 4G kept Home on screen after Plan run.
 */
test('shows the loading bar from a tap until the next screen has read', async ({
  page,
}) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  const bar = page.getByRole('banner').getByRole('progressbar', {
    name: 'Loading…',
  });
  await expect(bar).toBeHidden();

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTheList, async (route) => {
    await held;
    await route.continue();
  });

  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Production', exact: true })
    .click();
  await expect(bar).toBeVisible();
  await expect(
    page.getByRole('heading', { level: 1, name: 'Production' }),
  ).toBeVisible();
  // The screen is in, its first read still on its way.
  await expect(bar).toBeVisible();

  release();
  await expect(bar).toBeHidden();
});

/** Under reduced motion it stands still: shown, it says enough. */
test('stands still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();

  let release!: () => void;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(isTheList, async (route) => {
    await held;
    await route.continue();
  });
  await page
    .getByRole('navigation')
    .getByRole('link', { name: 'Production', exact: true })
    .click();

  const bar = page.getByRole('banner').getByRole('progressbar');
  await expect(bar).toBeVisible();
  await expect(bar.locator('div')).toHaveCSS('animation-name', 'none');
  release();
  await expect(bar).toBeHidden();
});
