import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

// The computer's zone, the same on every machine (ADR-072): a test that
// leans on it then fails everywhere, not only on a laptop that travels.
// Tokyo, UTC+9 all year, so a day read in the computer's zone differs from
// UTC's, and from an organization's in the Americas, for hours each day.
// Set here, before the workers start, as Node reads TZ once per process.
process.env.TZ = 'Asia/Tokyo';

/**
 * Component tests: jsdom, a mocked network, milliseconds each.
 *
 * The other half of the pairing playwright.config.ts describes. E2E proves the
 * client and server agree about field names, which needs both running. This
 * layer proves a component does the right thing when the server says no —
 * validation, empty states, conditional fields, error rendering — all of which
 * are tedious and slow to provoke against a live backend, and there are far
 * more of them.
 *
 * Separate config rather than a `test` block in vite.config.ts: that file is
 * loaded by the dev server and by Playwright's webServer, and neither needs to
 * parse test settings.
 */
export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],

    // e2e/ is Playwright's. Both use the word "test" and describe/it, and a
    // Playwright spec loaded by Vitest fails in a way that reads like a broken
    // component rather than a misrouted file.
    include: ['src/**/*.test.{ts,tsx}'],

    css: false,
    restoreMocks: true,
  },
});
