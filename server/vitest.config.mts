import { defineConfig } from 'vitest/config';

/**
 * The server's tests (ADR-067): unit specs beside their source, and the e2e
 * suites in test/, which boot the real application against the test
 * database. `npm test` runs the first, `npm run test:e2e` the second.
 *
 * Nest's dependency injection reads the constructor types TypeScript emits
 * as decorator metadata, so the transform must emit them as tsc does. Vite's
 * own transform (Oxc) does when told to. It would read the same two flags
 * from tsconfig.json; they are said here as well, so the tests never depend
 * on which tsconfig the transform happens to find.
 *
 * An .mts file: the server is CommonJS, and Vitest is an ES module.
 */
export default defineConfig({
  oxc: {
    decorator: { legacy: true, emitDecoratorMetadata: true },
  },
  test: {
    // describe, it, expect and vi without imports, as under Jest.
    globals: true,
    environment: 'node',
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
      reportsDirectory: './coverage',
    },
    projects: [
      {
        extends: true,
        test: {
          name: 'unit',
          // perf/'s own, for the budgets' verdict (ADR-082).
          include: ['src/**/*.spec.ts', 'perf/**/*.spec.ts'],
        },
      },
      {
        extends: true,
        test: {
          name: 'e2e',
          include: ['test/**/*.e2e-spec.ts'],
          globalSetup: ['./test/global-setup.ts'],
          // Open whatever the root .env says (ADR-078): every suite registers
          // its organizations, and the app reads .env only for what is unset.
          env: { REGISTRATION: 'open' },
          // One file at a time, as --runInBand did: every suite truncates
          // the one test database before each of its tests.
          fileParallelism: false,
        },
      },
    ],
  },
});
