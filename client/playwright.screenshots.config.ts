import { fileURLToPath } from 'node:url';

import { defineConfig, devices } from '@playwright/test';
import { config as loadEnv } from 'dotenv';

/**
 * The screens as pictures, from the demo: a "before" set for a visual
 * change, the same set after it, and later the pictures for user guides in
 * each language.
 *
 * Not a test suite. Nothing about the app is asserted and CI never runs it.
 * It reads the dev database, where `npm run seed:demo` wrote the demo, as
 * the demo Owner that command printed:
 *
 *     DEMO_EMAIL=demo-…@example.com npm run screenshots
 *
 * Every page in English, French and Chinese, light and dark, at a size of
 * each width class of the design language (ADR-090), the iPhone Duo closed
 * and open among them (the top bar also at 1200), into screenshots/out/ as
 * `<order>-<page>.<language>.<mode>.<width>.png`. The order is how much the
 * page matters, so the lowest numbers are the ones to look at first.
 * `npm run screenshots -- --grep 02-order` takes one page, and
 * `--project phone` one size.
 *
 * Its own API and client, on ports 3200 and 5373, beside any dev servers
 * already running on 3000 and 5173. A run makes a few hundred requests in a
 * minute or two, past the dev rate limit of 100 a minute, so this API runs
 * with the limits raised — as the e2e stack does — instead of anyone
 * having to restart theirs.
 *
 * The .env path is resolved from this file, as in playwright.config.ts, so
 * the VS Code extension finds it too.
 */
const ENV_FILE = fileURLToPath(new URL('../.env', import.meta.url));
loadEnv({ path: ENV_FILE, quiet: true });

const CLIENT_URL = 'http://localhost:5373';
const API_URL = 'http://localhost:3200';

const DATABASE_URL = process.env.DATABASE_URL;

/** A touch screen of this size: the theme's 44 px targets, no hover. */
const touch = (width: number, height: number) => ({
  ...devices['Desktop Chrome'],
  viewport: { width, height },
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
});

if (!DATABASE_URL) {
  throw new Error(
    'Missing DATABASE_URL — set it in ../.env. The screenshots read the dev ' +
      'database, where npm run seed:demo wrote the demo.',
  );
}

export default defineConfig({
  testDir: './screenshots',
  outputDir: './screenshots/.output',

  fullyParallel: true,
  retries: 0,
  reporter: [['list']],
  timeout: 60_000,
  expect: { timeout: 10_000 },

  globalSetup: './screenshots/global-setup.ts',

  use: {
    baseURL: CLIENT_URL,
    // Signed in once, in global-setup, rather than once per picture: every
    // sign-in from a new browser raises a notification, and the bell would
    // count them in the pictures.
    storageState: './screenshots/.state/session.json',
    trace: 'off',
  },

  /**
   * One size from each width class (docs/design-language.md, Screen
   * sizes), as the home journey walks them: the touch screens at twice
   * their size in pixels, the computers at once. The Duo's two are
   * estimates until measured on the device.
   */
  projects: [
    {
      // xl: a desktop's screen.
      name: 'wide',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
      },
    },
    {
      // lg: a large laptop's, the rail beside the page.
      name: 'desktop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      // The 1200px breakpoint itself, where the links move into the
      // drawer below it: the narrowest the full bar is ever drawn, and
      // where French, the longest, is likeliest to run out of room.
      name: 'laptop',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1200, height: 800 },
      },
    },
    {
      // md: a tablet held sideways.
      name: 'tablet',
      use: touch(1180, 820),
    },
    {
      // sm: the Duo open, about 10 px below md, and under 700 px tall.
      name: 'duo-open',
      use: touch(890, 626),
    },
    {
      // xs: the Duo closed.
      name: 'duo-closed',
      use: touch(466, 678),
    },
    {
      // xs: a phone.
      name: 'phone',
      use: touch(390, 844),
    },
  ],

  webServer: [
    {
      command: 'npm run start:dev',
      cwd: '../server',
      url: `${API_URL}/health`,
      reuseExistingServer: true,
      timeout: 120_000,
      stdout: 'ignore',
      stderr: 'ignore',
      env: {
        NODE_ENV: 'development',
        PORT: '3200',
        DATABASE_URL,
        RATE_LIMIT_MAX: '10000',
        THROTTLE_FACTOR: '1000',
      },
    },
    {
      command: 'npm run dev -- --port 5373 --strictPort',
      url: CLIENT_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: {
        VITE_API_TARGET: API_URL,
        // No hot reload, as the browser suite's server has it (#183): a
        // file saved during a run would reload a page in the middle of a
        // picture.
        VITE_HMR: 'off',
      },
    },
  ],
});
