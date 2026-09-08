import { defineConfig, devices } from '@playwright/test';

/**
 * End-to-end tests run against a real client, a real server, and a real
 * database. Nothing here is mocked — see ADR-0XX. A mocked API in an e2e test
 * only proves the UI agrees with our *assumptions* about the server, which is
 * exactly the class of bug this suite exists to catch.
 *
 * Component-level tests (Vitest + MSW) are the place for mocking. They cover
 * error states, empty states, and validation branches that are tedious to
 * provoke against a live backend.
 */

const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://localhost:5173';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3000';

export default defineConfig({
  testDir: './e2e',
  outputDir: './e2e/.output',

  /**
   * Safe to parallelise because every spec provisions its own organisation.
   * Shared-schema multi-tenancy (ADR-002) means two workers physically cannot
   * see each other's rows, so there is no cross-test data collision to guard
   * against.
   */
  fullyParallel: true,

  // A committed `test.only` silently shrinks the suite to one test and CI
  // still reports green. Fail the run instead.
  forbidOnly: !!process.env.CI,

  // Retries locally hide flakiness; in CI they distinguish a genuine failure
  // from a slow container. `trace: 'on-first-retry'` below captures the retry.
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,

  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'never' }]],

  timeout: 30_000,
  expect: { timeout: 5_000 },

  globalSetup: './e2e/global-setup.ts',

  use: {
    baseURL: CLIENT_URL,

    // Every test starts already signed in as the owner of the organisation
    // provisioned in global-setup. Specs that need a *different* tenant use
    // the `freshOrg` fixture instead.
    storageState: './e2e/.auth/owner.json',

    /**
     * Deliberately NOT setting `extraHTTPHeaders: { 'X-Requested-With': ... }`
     * here.
     *
     * That would make Playwright attach the CSRF header to every request the
     * browser makes, including the app's own fetches — so a bug where the
     * client forgot to send it would pass in e2e and 403 in production. The
     * header belongs to the app. Only the API helpers in e2e/support/api.ts
     * set it, because those are standing in for a browser, not testing one.
     */

    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },

  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],

  /**
   * `reuseExistingServer` means a normal day is unaffected: if the dev server
   * and API are already up, Playwright attaches to them. CI starts both from
   * scratch.
   *
   * The API is pointed at its own database. Sharing DATABASE_URL_TEST with the
   * Jest e2e suite would let `npm run test:e2e` truncate tables underneath a
   * Playwright run.
   */
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../server',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'pipe',
      stderr: 'pipe',
      env: {
        NODE_ENV: 'development',
        DATABASE_URL:
          process.env.E2E_DATABASE_URL ??
          'postgresql://app:app@localhost:5432/foundation_e2e',
        // Registration is throttled to 5/min per IP. Every worker and every
        // `freshOrg` fixture registers, so the production limit would fail the
        // suite rather than the feature.
        RATE_LIMIT_MAX: '10000',
        RATE_LIMIT_AUTH_MAX: '10000',
      },
    },
    {
      command: 'npm run dev',
      url: CLIENT_URL,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
  ],
});
