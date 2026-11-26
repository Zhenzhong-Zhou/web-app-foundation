/**
 * Whether this is `npm run dev` or the browser suite's build, where the
 * screens have what is for development and the tests alone: en-XA
 * (ADR-054's amendment for #530) and the page that throws on purpose
 * (ADR-008's amendment for #530). False in every other build, which drops
 * what it guards, and vite.config.ts stops one whose chunks still carry
 * either. Compiled in by vite.config.ts, and by vitest.config.ts for the
 * component tests.
 */
declare const __DEV_AND_TESTS__: boolean;
