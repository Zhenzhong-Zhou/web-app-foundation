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
 * Every page in English, French and Chinese, light and dark, at desktop and
 * phone width (the top bar also at 1200), into screenshots/out/ as
 * `<order>-<page>.<language>.<mode>.<width>.png`. The order is how much the
 * page matters, so the lowest numbers are the ones to look at first.
 * `npm run screenshots -- --grep 02-order` takes one page.
 *
 * Its own API and client, on ports 3200 and 5373, beside any dev servers
 * already running on 3000 and 5173. A run makes a few hundred requests in a
 * minute or two, past the dev rate limit of 100 a minute, so this API runs
 * with the limits raised — as the e2e stack does — instead of anyone
 * having to restart theirs.
 */
loadEnv({ path: '../.env', quiet: true });

const CLIENT_URL = 'http://localhost:5373';
const API_URL = 'http://localhost:3200';

const DATABASE_URL = process.env.DATABASE_URL;

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

  projects: [
    {
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
      name: 'phone',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 390, height: 844 },
        deviceScaleFactor: 2,
        isMobile: true,
        hasTouch: true,
      },
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
        RATE_LIMIT_AUTH_MAX: '10000',
        THROTTLE_FACTOR: '1000',
      },
    },
    {
      command: 'npm run dev -- --port 5373 --strictPort',
      url: CLIENT_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { VITE_API_TARGET: API_URL },
    },
  ],
});
