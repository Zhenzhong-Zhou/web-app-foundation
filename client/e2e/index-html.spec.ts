import type { Locator, Page } from '@playwright/test';

import { expect, test } from './fixtures';
import { OWNER_STATE_PATH } from './global-setup';

/**
 * What index.html gives before the app starts (ADR-082): the home screen's
 * name and icons, the browser's bar, a shared link's card, and the loading
 * mark in the mode the app will open in. Signed out, as a first visit is;
 * reads only.
 */
test.use({ storageState: { cookies: [], origins: [] } });

/**
 * Holds back each request to `url` until `release` is called, slowed, never
 * answered in its place; `asked` settles once the page has asked for it.
 */
async function hold(page: Page, url: RegExp) {
  let release = () => {};
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  let asked = () => {};
  const wasAsked = new Promise<void>((resolve) => {
    asked = resolve;
  });
  await page.route(url, async (route) => {
    asked();
    await released;
    await route.continue();
  });
  return { asked: wasAsked, release };
}

/**
 * The app's entry. The suite runs on Vite's dev server, whose entry is
 * src/main.tsx; a build's is a hashed file in /assets/.
 */
const theApp = /\/src\/main\.tsx(\?|$)/;

/** Holds the app's entry back, so the page stays as index.html drew it. */
const holdTheApp = (page: Page) => hold(page, theApp);

/** index.html's own title, VITE_APP_NAME: the app is held, so nothing has changed it. */
async function indexTitle(page: Page): Promise<string> {
  await expect(page.locator('#loading-mark').getByRole('img')).toBeAttached();
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

/** The animation the progress bar's moving part runs, or none. */
const slides = (progress: Locator) =>
  progress.evaluate((bar) => getComputedStyle(bar, '::before').animationName);

const themeColors = (page: Page) =>
  page
    .locator('meta[name="theme-color"]')
    .evaluateAll((metas) =>
      metas.map((meta) => (meta as HTMLMetaElement).content),
    );

test("names the product for a home screen, and a shared link's card", async ({
  page,
  request,
  baseURL,
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
  // The picture, in full at the site's own address: VITE_SITE_URL, which
  // playwright.config.ts gives the dev server, ../.env's or this one's.
  const site = process.env.VITE_SITE_URL || baseURL;
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute(
    'content',
    new URL('/og-image.png', site).href,
  );
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
    // The app's timers under the test's hand, so its spinner's 250 ms can
    // pass without waiting them out; the mark's CSS keeps its own time.
    await page.clock.install();
    const app = await holdTheApp(page);
    const session = await hold(page, /\/api\/v1\/auth\/me$/);
    await page.goto('/login', { waitUntil: 'commit' });
    const name = await indexTitle(page);

    const mark = page.locator('#loading-mark').getByRole('img', { name });
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
    await expect(page.locator('#loading-mark')).toHaveCSS(
      'background-color',
      background,
    );
    const colours = await themeColors(page);
    expect(colours.map(rgb)).toEqual([background, background]);
    // The browser's own defaults in that mode too, so whatever it draws
    // before the app's styles apply is never its black on the dark page.
    await expect(page.locator('html')).toHaveCSS('color-scheme', stored);
    await expect(page.locator('html')).toHaveCSS(
      'color',
      rgb(stored === 'dark' ? '#E6E9EF' : '#141A24'),
    );

    // The progress bar under the mark waits 250 ms after it, the delay
    // the app's spinner waited.
    const progress = page.locator('#loading-mark .bar');
    await expect(progress).toHaveCSS('animation-delay', '0.55s');

    // The app starts, and reads the session: the mark stays, with the
    // progress bar sliding under it, and the app's spinner, due after
    // 250 ms, stays out of a screen reader's reach under it.
    app.release();
    await session.asked;
    await page.clock.runFor(500);
    await expect(mark).toBeVisible();
    await expect(progress).toBeVisible();
    expect(await slides(progress)).toBe('loading-bar-slides');
    await expect(page.getByRole('progressbar')).toHaveCount(0);

    // The app's first page takes its place, in the same mode.
    session.release();
    await expect(page.getByLabel(/email/i)).toBeVisible();
    await expect(page.locator('#loading-mark')).toHaveCount(0);
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

// Under reduced motion the progress bar shows, standing still.
test('keeps the progress bar still under reduced motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await holdTheApp(page);
  await page.goto('/login', { waitUntil: 'commit' });

  const progress = page.locator('#loading-mark .bar');
  await expect(progress).toBeVisible();
  expect(await slides(progress)).toBe('none');
});

/**
 * The app's entry refused, as a dropped connection or a missing file
 * leaves it: the mark gives way to one line and Reload, rather than
 * sliding on as if the app were coming, in the reader's language, the one
 * chosen on this device, else the browser's.
 */
test("puts one line and Reload in the mark's place when the app does not load", async ({
  page,
}) => {
  await page.addInitScript(() => localStorage.setItem('language', 'zh-Hans'));
  await page.route(theApp, (route) => route.abort());
  await page.goto('/login', { waitUntil: 'commit' });

  const failed = page.locator('#loading-mark').getByRole('alert');
  await expect(failed).toContainText(
    '应用未能加载。请检查网络连接，然后重新加载。',
  );
  await expect(failed).toHaveAttribute('lang', 'zh-Hans');
  await expect(page.locator('#loading-mark svg')).toHaveCount(0);
  await expect(page.locator('#loading-mark .bar')).toHaveCount(0);
  const reload = page.getByRole('button', { name: '重新加载' });
  await expect(reload).toBeFocused();

  // Reload asks for the page again, and with the entry let through the
  // app starts.
  await page.unroute(theApp);
  await reload.click();
  await expect(page.getByRole('heading', { name: '登录' })).toBeVisible();
});

test.describe("in the browser's language", () => {
  test.use({ locale: 'fr-CA' });

  test('says so in French with nothing chosen on the device', async ({
    page,
  }) => {
    await page.route(theApp, (route) => route.abort());
    await page.goto('/login', { waitUntil: 'commit' });

    await expect(page.getByRole('alert')).toContainText(
      'L’application n’a pas pu se charger.',
    );
    await expect(page.getByRole('button', { name: 'Recharger' })).toBeFocused();
  });
});

/**
 * Signed in, the first page's chunk can come well after the rail: the mark
 * stays over the rail until the page has drawn, so the two appear at once.
 */
test.describe('signed in', () => {
  test.use({ storageState: OWNER_STATE_PATH });

  test('keeps the loading mark until the first page has drawn', async ({
    page,
  }) => {
    const home = await hold(page, /\/src\/home\/home-page\.tsx(\?|$)/);
    await page.goto('/', { waitUntil: 'commit' });
    const name = await indexTitle(page);
    await home.asked;

    // The rail is there, under the mark, kept from screen readers with
    // the rest of #root till the mark comes down, and the page is not.
    await expect(
      page.getByRole('navigation', { name: 'Main', includeHidden: true }),
    ).toBeAttached();
    await expect(page.getByRole('navigation', { name: 'Main' })).toHaveCount(0);
    await expect(
      page.locator('#loading-mark').getByRole('img', { name }),
    ).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveCount(0);

    home.release();
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await expect(page.locator('#loading-mark')).toHaveCount(0);
    await expect(page.getByRole('navigation', { name: 'Main' })).toBeVisible();
  });
});
