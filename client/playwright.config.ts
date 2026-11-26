import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * Loaded here rather than relying on the npm script, because `npx playwright
 * test` is what anyone actually types and it does not go through dotenv-cli.
 * Without this DATABASE_URL_E2E is undefined and the API starts against
 * nothing — which Playwright reports as a timeout, not a config error.
 *
 * The path is resolved from this file, not the working directory. The VS
 * Code Playwright extension loads the config from the repo root, where
 * '../.env' points outside the repo.
 */
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
loadEnv({ path: ENV_FILE, quiet: true });

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

const CLIENT_URL = process.env.E2E_CLIENT_URL ?? 'http://localhost:5273';
const API_URL = process.env.E2E_API_URL ?? 'http://localhost:3100';

/**
 * Firefox runs in CI, on Linux, and on a machine that asks for it with
 * E2E_FIREFOX=1. Playwright's Firefox build cannot open its profile on some
 * macOS versions ("Could not find profile folder", "Operation not
 * permitted"), whatever the temporary folder, while Chromium and WebKit
 * start there; so it is off by default on the Mac, where scripts/verify.sh
 * in full runs e2e/accessibility.spec.ts in Firefox from Playwright's Linux
 * image instead, with E2E_FIREFOX=1, and CI's every-browser runs check
 * every screen in it.
 */
const FIREFOX = Boolean(process.env.CI || process.env.E2E_FIREFOX);

/**
 * The dev server in place of the built client (webServer, below), for one
 * spec at a time: E2E_DEV_SERVER=1, as `npm run test:e2e:ui` sets. Nothing
 * else sets it, CI and scripts/verify.sh among them.
 */
const DEV_SERVER = Boolean(process.env.E2E_DEV_SERVER);

/** The specs WebKit and Firefox run besides Chromium (projects, below). */
const EVERY_ENGINE =
  /(?:accessibility|document-refusals|page-frame|sign-in-return)\.spec\.ts/;

/**
 * What the client is given, built or on the dev server: vite.config.ts
 * reads them as it starts or builds.
 */
const CLIENT_SETTINGS = {
  VITE_API_TARGET: 'http://localhost:3100',
  // A © line, so the screens before sign-in are checked with their
  // footer, as on Render (ADR-082); ../.env's own, where it sets one.
  VITE_COPYRIGHT_HOLDER:
    process.env.VITE_COPYRIGHT_HOLDER || 'Zhenzhong (Bob) Zhou',
  // A site's address, so a shared link's card has its picture, as on
  // Render; ../.env's own, where it sets one.
  VITE_SITE_URL: process.env.VITE_SITE_URL || CLIENT_URL,
};

const E2E_DATABASE_URL = process.env.DATABASE_URL_E2E;

if (!E2E_DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL_E2E — set it in ../.env. Without it the e2e server ' +
      'starts against no database, or worse, falls back to the dev one.',
  );
}

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

  // Retries locally hide flakiness; in CI they tell a test that fails every
  // time from one that passes on a retry. `trace: 'on-first-retry'` below
  // captures the retry.
  retries: process.env.CI ? 2 : 0,
  // A test that passes only on a retry fails the run on CI, named flaky in
  // the report (ADR-008's November 2026 amendment): green means every test
  // passed the first time, and the flaky one is filed as docs/conventions.md,
  // Tests, says. Before it, a retry's pass left the run green, seen only by
  // someone who read the report's flaky rows, as #232 and #248 were.
  failOnFlakyTests: !!process.env.CI,
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

  /**
   * Every spec in Chromium. In WebKit (Safari, and every browser on an
   * iPhone, WeChat's included) and Firefox, the accessibility spec: twenty
   * screens rendered and checked, in both modes, which is where an engine's
   * difference in layout, focus or contrast shows; and the refused PDF's
   * page, which each browser reaches by its own navigation, from a plain
   * link (ADR-071, amended for #526), and signing in from its link, where
   * two navigations at once land in each engine's order; and the page
   * frame's spec, a list's header that stays under the top bar and a table
   * too wide for its box, since sticking, scroll margins and focus's
   * scrolling differ between engines (ADR-090, amended November 2026). On
   * an iPhone's screen and engine, mobile.spec.
   *
   * Only specs that make their own organization, or change nothing, run in
   * more than one project: the rest share the owner's organization and fixed
   * SKUs, and two browsers running them at once would collide.
   */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
      testIgnore: /mobile\.spec\.ts/,
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] },
      testMatch: EVERY_ENGINE,
    },
    ...(FIREFOX
      ? [
          {
            name: 'firefox',
            use: { ...devices['Desktop Firefox'] },
            testMatch: EVERY_ENGINE,
          },
        ]
      : []),
    {
      name: 'iphone',
      use: { ...devices['iPhone 15'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],

  /**
   * The API, then the client the suite runs on.
   *
   * The API is reused when it is already up on 3100, so a normal day is
   * unaffected; CI starts it from scratch. It is pointed at its own
   * database. Sharing DATABASE_URL_TEST with the Jest e2e suite would let
   * `npm run test:e2e` truncate tables underneath a Playwright run.
   *
   * The client is built, then served (ADR-008's amendment for #530): each
   * run builds it in the tests' own mode into dist-e2e/, never dist/
   * (vite.config.ts), and Vite's preview server serves those files on 5273,
   * passing /api on to the API as the dev server did. The dev server sent
   * each module as it transformed it: Node aborted inside it (#530), and in
   * Linux WebKit a page waited on the start screen for modules it never
   * sent (#643). A built client is never reused, since a server already on
   * 5273 would serve an earlier run's build: the run stops, saying the port
   * is taken. Under E2E_DEV_SERVER, the dev server as before.
   */
  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../server',
      url: `${API_URL}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
      env: {
        NODE_ENV: 'development',
        PORT: '3100',
        DATABASE_URL: E2E_DATABASE_URL,
        // The limit on every route without one of its own.
        RATE_LIMIT_MAX: '10000',
        // Registration is throttled to 5/min per IP. Every worker and every
        // freshOrg fixture registers, so the production limit fails the suite
        // rather than the feature.
        THROTTLE_FACTOR: '1000',
        // Every worker and freshOrg registers, so sign-up is open here
        // whatever the root .env says (ADR-078).
        REGISTRATION: 'open',
        // The pages the suite breaks on purpose report to no tracker, even
        // where the root .env names a development project (ADR-084).
        ERROR_TRACKER_DSN: '',
        // The app the API's links lead to, this suite's client, as CI's
        // .env says, not ../.env's own for npm run dev: a refused PDF's
        // page links back into the app (ADR-071, amended for #526).
        CLIENT_URL,
      },
    },
    DEV_SERVER
      ? {
          command: 'npm run dev -- --port 5273 --strictPort',
          url: CLIENT_URL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
          env: {
            ...CLIENT_SETTINGS,
            // No hot reload, which vite.config.ts reads (#183). A file
            // under src/ saved during a run reloaded every open page, and a
            // test in the middle of a form filled a field on one page and
            // pressed its button on the next. A person's own `npm run dev`
            // keeps it; a dev server already on 5273 is reused as it is,
            // hot reload and all, so stop that one first.
            VITE_HMR: 'off',
          },
        }
      : {
          command:
            'npm run build:e2e && npm run preview:e2e -- --port 5273 --strictPort',
          url: CLIENT_URL,
          reuseExistingServer: false,
          // The build and the server's start, about a second and a half on
          // the Mac in November 2026.
          timeout: 120_000,
          env: {
            ...CLIENT_SETTINGS,
            // A production build's, as Vite gives a build where none is
            // set. ../.env's development, or CI's test, which reach this
            // process, would build React's development code and what
            // import.meta.env.DEV guards.
            NODE_ENV: 'production',
          },
        },
  ],
});
