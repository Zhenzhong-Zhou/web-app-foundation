import type { Page } from '@playwright/test';

import { expect, test } from './fixtures';

/**
 * What index.html gives before the app starts (ADR-082): the home screen's
 * name and icons, the browser's bar, a shared link's card, and the loading
 * mark in the mode the app will open in. Signed out, as a first visit is;
 * reads only.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Holds the app's entry back until the returned function is called, so the
 * page stays as index.html drew it. The suite runs on Vite's dev server,
 * whose entry is src/main.tsx; a build's is a hashed file in /assets/.
 */
async function holdTheApp(page: Page): Promise<() => void> {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route(/\/src\/main\.tsx(\?|$)/, async (route) => {
    await released;
    await route.continue();
  });
  return release;
}

/** index.html's own title, VITE_APP_NAME: the app is held, so nothing has changed it. */
async function indexTitle(page: Page): Promise<string> {
  await expect(page.locator('#root').getByRole('img')).toBeAttached();
  const name = await page.title();
  // Filled in by vite.config.ts's app-name plugin, never left a placeholder.
  expect(name).not.toBe('');
  expect(name).not.toContain('%');
  return name;
}

/** A colour as computed styles give it: #161A21 as rgb(22, 26, 33). */
function rgb(hex: string): string {
  const [r, g, b] = [1, 3, 5].map((at) =>
    Number.parseInt(hex.slice(at, at + 2), 16),
  );
  return `rgb(${r}, ${g}, ${b})`;
}

const themeColors = (page: Page) =>
  page
    .locator('meta[name="theme-color"]')
    .evaluateAll((metas) =>
      metas.map((meta) => (meta as HTMLMetaElement).content),
    );

test("names the product for a home screen, and a shared link's card", async ({
  page,
  request,
}) => {
  await holdTheApp(page);
  await page.goto('/', { waitUntil: 'commit' });
  const name = await indexTitle(page);

  await expect(
    page.locator('meta[name="apple-mobile-web-app-title"]'),
  ).toHaveAttribute('content', name);
  await expect(page.locator('link[rel="manifest"]')).toHaveAttribute(
    'href',
    '/manifest.webmanifest',
  );

  const response = await request.get('/manifest.webmanifest');
  expect(response.status()).toBe(200);
  expect(response.headers()['content-type']).toBe('application/manifest+json');
  const manifest = (await response.json()) as {
    name: string;
    short_name: string;
    display: string;
    start_url: string;
    icons: { src: string; sizes: string; purpose?: string }[];
  };
  expect(manifest).toMatchObject({
    name,
    short_name: name,
    display: 'browser',
    start_url: '/',
  });
  expect(
    manifest.icons.map(({ sizes, purpose }) => `${sizes} ${purpose ?? 'any'}`),
  ).toEqual(['192x192 any', '512x512 any', '512x512 maskable']);
  // Each icon is the file itself, never index.html in its place.
  for (const icon of manifest.icons) {
    const file = await request.get(icon.src);
    expect(file.status()).toBe(200);
    expect(file.headers()['content-type']).toBe('image/png');
  }

  await expect(page.locator('meta[property="og:title"]')).toHaveAttribute(
    'content',
    name,
  );
  await expect(page.locator('meta[property="og:description"]')).toHaveAttribute(
    'content',
    'Inventory, orders, production and invoices.',
  );
  await expect(page.locator('meta[property="og:type"]')).toHaveAttribute(
    'content',
    'website',
  );
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute(
    'content',
    'summary_large_image',
  );
  // The picture needs the site's own address, VITE_SITE_URL in ../.env,
  // which the dev server reads as playwright.config.ts does.
  const site = process.env.VITE_SITE_URL;
  const picture = page.locator('meta[property="og:image"]');
  if (site) {
    await expect(picture).toHaveAttribute(
      'content',
      new URL('/og-image.png', site).href,
    );
  } else {
    await expect(picture).toHaveCount(0);
  }
  const image = await request.get('/og-image.png');
  expect(image.headers()['content-type']).toBe('image/png');
});

for (const scheme of ['light', 'dark'] as const) {
  test(`gives the browser's bar the page's colour, the system ${scheme}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: scheme });
    await page.goto('/login');
    await expect(page.getByLabel(/email/i)).toBeVisible();

    // One for each of the system's modes, and the one for this mode is the
    // page the app draws.
    const [light, dark] = await themeColors(page);
    const drawn = await page.evaluate(
      () => getComputedStyle(document.body).backgroundColor,
    );
    expect(rgb(scheme === 'light' ? light : dark)).toBe(drawn);
    await expect(page.locator('meta[name="theme-color"]')).toHaveCount(2);
    expect(light).not.toBe(dark);
  });
}

/**
 * A mode chosen in the app wins over the system's, from the first moment:
 * stored Dark under a light system, and stored Light under a dark one.
 */
for (const [stored, system] of [
  ['dark', 'light'],
  ['light', 'dark'],
] as const) {
  test(`draws the loading mark in ${stored}, chosen, with the system ${system}`, async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: system });
    await page.addInitScript((mode) => {
      localStorage.setItem('mui-mode', mode);
    }, stored);
    const release = await holdTheApp(page);
    await page.goto('/login', { waitUntil: 'commit' });
    const name = await indexTitle(page);

    const mark = page.locator('#root').getByRole('img', { name });
    await expect(mark).toBeVisible();
    await expect(page.locator('html')).toHaveClass(stored);
    // It waits 300 ms, so a quick load shows the colour alone, and then
    // appears at once: it does not move.
    await expect(mark).toHaveCSS('animation-delay', '0.3s');
    await expect(mark).toHaveCSS('animation-duration', '0s');
    await expect(mark.locator('.stem')).toHaveCSS(
      'fill',
      stored === 'dark' ? 'rgb(255, 255, 255)' : 'rgb(28, 34, 48)',
    );

    // The page, and the bar in both of the system's modes, in the mode
    // chosen.
    const background = await page.evaluate(
      () => getComputedStyle(document.documentElement).backgroundColor,
    );
    const colours = await themeColors(page);
    expect(colours.map(rgb)).toEqual([background, background]);

    // The app's first page takes its place, in the same mode.
    release();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(mark).toHaveCount(0);
    expect(
      await page.evaluate(
        () => getComputedStyle(document.body).backgroundColor,
      ),
    ).toBe(background);
    expect((await themeColors(page)).map(rgb)).toEqual([
      background,
      background,
    ]);
  });
}
