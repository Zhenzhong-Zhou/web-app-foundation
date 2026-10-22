import type { Page } from '@playwright/test';

/**
 * A deploy, as a tab sees it (ADR-081): the static host's version.json
 * names another build than the one the tab runs, which on the dev server
 * is `dev`. The file is the static host's, never the API's, so the rule
 * that nothing in a spec mocks the API holds. `urgent` gives the new build
 * an API revision above the one the API serves, and the client was built
 * for: one whose saves this tab would be refused.
 */
export async function deploy(page: Page, { urgent = false } = {}) {
  const health = await page.request.get('/api/health');
  const { apiRevision } = (await health.json()) as { apiRevision: number };

  await page.route('**/version.json?*', (route) =>
    route.fulfill({
      json: {
        build: 'e2e-new-build',
        builtAt: new Date().toISOString(),
        version: '0.0.0-e2e',
        apiRevision: apiRevision + (urgent ? 1 : 0),
      },
    }),
  );
}

/**
 * The tab hidden and shown again, as switching to another tab and back
 * does: headless browsers never hide a page themselves.
 */
export async function backToTheFront(page: Page) {
  await page.evaluate(() => {
    for (const state of ['hidden', 'visible'] as const) {
      Object.defineProperty(document, 'visibilityState', {
        configurable: true,
        get: () => state,
      });
      document.dispatchEvent(new Event('visibilitychange'));
    }
  });
}
