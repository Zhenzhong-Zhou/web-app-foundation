import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';
import {
  created,
  createLocation,
  createProduct,
  daysFromNow,
  E2E_PASSWORD,
  signInAs,
} from './support/api';

/**
 * The text size (ADR-075): a percentage on <html>, so every rem in the app
 * moves with it, kept on this device.
 *
 * Reads and changes only this browser's storage, so it runs beside the
 * rest of the suite on the shared organization.
 */

/**
 * What makes the page scroll sideways, if anything: the innermost elements
 * past the window's right edge, leaving out what sits in a box that scrolls
 * on its own (a table in its container), each named so a failure says
 * where to look. Empty when the page fits.
 */
async function overflowing(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const width = root.clientWidth;
    if (root.scrollWidth <= width) return [];

    const past = (el: Element) => el.getBoundingClientRect().right > width + 1;
    const scrollsOnItsOwn = (el: Element) => {
      for (
        let up = el.parentElement;
        up && up !== root;
        up = up.parentElement
      ) {
        if (getComputedStyle(up).overflowX !== 'visible' && !past(up)) {
          return true;
        }
      }
      return false;
    };

    const culprits = Array.from(document.body.querySelectorAll('*')).filter(
      (el) =>
        past(el) && !scrollsOnItsOwn(el) && !Array.from(el.children).some(past),
    );

    if (culprits.length === 0) return ['something past the right edge'];
    return culprits.slice(0, 3).map((el) => {
      const mui = Array.from(el.classList)
        .filter((name) => /^Mui[A-Za-z]+-root$/.test(name))
        .join(' ');
      const words = (el.getAttribute('aria-label') ?? el.textContent ?? '')
        .trim()
        .slice(0, 40);
      return `${el.tagName.toLowerCase()}${mui ? ` (${mui})` : ''}: ${words}`;
    });
  });
}

/**
 * Lists that need nothing seeded, each with its own kind of layout; every
 * list with a date range is here, since that row is the widest.
 */
const SCREENS = [
  '/',
  '/inventory',
  '/orders',
  '/movements',
  '/invoices',
  '/credit-notes',
  '/return-authorizations',
  '/production',
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
  // 16px is Chromium's default, so Standard.
  await expect(page.locator('html')).toHaveCSS('font-size', '16px');

  await page.getByRole('button', { name: /signed in as/ }).click();
  await page.getByRole('combobox', { name: 'Text size' }).click();
  await page.getByRole('option', { name: 'Larger text' }).click();

  await expect(page.locator('html')).toHaveCSS('font-size', '20px');

  await page.reload();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');

  // Back to Standard leaves the browser's own size in charge again.
  await page.getByRole('button', { name: /signed in as/ }).click();
  await page.getByRole('combobox', { name: 'Text size' }).click();
  await page.getByRole('option', { name: 'Standard text' }).click();
  await expect(page.locator('html')).toHaveCSS('font-size', '16px');
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

  await expect(page.locator('html')).toHaveCSS('font-size', '18px');

  await context.close();
});

for (const [where, viewport] of [
  ['never scroll sideways on a desktop', null],
  ['reflow at 320px wide (WCAG 1.4.10)', { width: 320, height: 640 }],
] as const) {
  test(`at Larger, the main screens ${where}`, async ({ page }) => {
    test.setTimeout(90_000);
    if (viewport) await page.setViewportSize(viewport);
    // Larger from the first paint, as a device that chose it before opens.
    await page.addInitScript(() => localStorage.setItem('textSize', 'larger'));

    const wide: Record<string, string[]> = {};
    for (const path of SCREENS) {
      await page.goto(path);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
      await expect(page.locator('html')).toHaveCSS('font-size', '20px');
      await page.waitForLoadState('networkidle');
      const culprits = await overflowing(page);
      if (culprits.length > 0) wide[path] = culprits;
    }

    // All at once, so one run lists every screen to fix, and what on it.
    expect(wide).toEqual({});
  });
}

/** A phone's width at Larger, from the first paint. */
async function onAPhoneAtLarger(page: Page): Promise<void> {
  await page.setViewportSize({ width: 320, height: 640 });
  await page.addInitScript(() => localStorage.setItem('textSize', 'larger'));
}

test('at Larger on a phone, a dialog wraps its buttons inside it', async ({
  page,
  freshOrg,
}) => {
  // In French, where labels run longest: Annuler and Ajouter un emplacement
  // are wider than a 320px dialog side by side at Larger; in English, Cancel
  // and Add location still fit. Its own organization, so the shared owner's
  // language is left alone.
  const french = await freshOrg.api.patch('/v1/account/profile', {
    data: { locale: 'fr-CA' },
  });
  expect(french.ok(), await french.text()).toBeTruthy();

  await signInAs(page, freshOrg.api);
  await onAPhoneAtLarger(page);
  await page.goto('/locations');
  await page.getByRole('button', { name: 'Ajouter un emplacement' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await expect(page.locator('html')).toHaveCSS('font-size', '20px');

  // The action drops under Annuler, and nothing runs past the dialog.
  const cancel = await dialog
    .getByRole('button', { name: 'Annuler' })
    .boundingBox();
  const add = await dialog
    .getByRole('button', { name: 'Ajouter un emplacement' })
    .boundingBox();
  expect(add!.y).toBeGreaterThanOrEqual(cancel!.y + cancel!.height);
  const spill = await dialog.evaluate((el) => el.scrollWidth - el.clientWidth);
  expect(spill).toBeLessThanOrEqual(0);
});

test('at Larger on a phone, Home with its cards fits', async ({
  page,
  freshOrg,
}) => {
  // Work of its own, so Home shows its cards whatever else the suite is
  // doing; the shared organization's walk above only meets them by chance.
  const product = await createProduct(freshOrg.api, { tracksLots: true });
  const location = await createLocation(freshOrg.api);
  await created(
    await freshOrg.api.post('/v1/stock/movements', {
      data: {
        variantId: product.variantId,
        toLocationId: location.id,
        quantity: '5',
        reason: 'receipt',
        lot: { code: 'E2E-PHONE', expiresAt: daysFromNow(10) },
      },
    }),
  );

  await signInAs(page, freshOrg.api);
  await onAPhoneAtLarger(page);
  await page.goto('/');

  await expect(
    page.getByRole('region', { name: 'Expiring soon' }),
  ).toBeVisible();
  await page.waitForLoadState('networkidle');
  expect(await overflowing(page)).toEqual([]);
});

test('at Larger on a phone, a closing organization’s banner fits', async ({
  page,
  freshOrg,
}) => {
  const scheduled = await freshOrg.api.post('/v1/organization/deletion', {
    data: {
      password: E2E_PASSWORD,
      organizationName: freshOrg.organizationName,
      declineExport: true,
    },
  });
  expect(scheduled.ok(), await scheduled.text()).toBeTruthy();

  await signInAs(page, freshOrg.api);
  await onAPhoneAtLarger(page);
  await page.goto('/');

  // Its two buttons and × are wider than a phone beside the words, so the
  // theme's Alert puts them on a line of their own under the words, which
  // keep their width; without it the words narrow to a column beside them.
  const cancel = page.getByRole('button', { name: 'Cancel deletion' });
  await expect(cancel).toBeInViewport();
  const words = await page
    .getByRole('alert')
    .filter({ has: cancel })
    .locator('.MuiAlert-message')
    .boundingBox();
  const button = await cancel.boundingBox();
  expect(button!.y).toBeGreaterThanOrEqual(words!.y + words!.height - 1);

  await page.waitForLoadState('networkidle');
  expect(await overflowing(page)).toEqual([]);
});

test('less motion, when asked: transitions end at once', async ({ page }) => {
  // A button's own CSS transition, always there, so the check measures the
  // setting and not whether something happened to be animating.
  const duration = () =>
    page
      .getByRole('button', { name: 'Change password' })
      .evaluate((el) => parseFloat(getComputedStyle(el).transitionDuration));

  await page.goto('/account');
  expect(await duration()).toBeGreaterThan(0.1);

  await page.emulateMedia({ reducedMotion: 'reduce' });
  expect(await duration()).toBeLessThan(0.001);
});
