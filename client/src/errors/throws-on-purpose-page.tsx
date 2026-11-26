/**
 * A page that throws as it draws, on purpose (ADR-008's amendment for
 * #530): the crash page before sign-in, at /throws-on-purpose, inside the
 * boundary of the screens before sign-in (App.tsx), where the browser
 * suite checks it in every engine. The sign-in page is part of the app's
 * entry in a build, so a test cannot swap its file to break it, as it did
 * on the dev server.
 *
 * In `npm run dev` and the browser suite's build alone: every other build
 * drops the page and its address, where a visitor meets Page not found,
 * and vite.config.ts's `withoutThrowsOnPurpose` stops one that carries
 * either.
 */
export function ThrowsOnPurposePage(): never {
  throw new Error('This page throws on purpose, as it draws.');
}

declare global {
  /**
   * Whether the app has the page that throws on purpose: true in `npm run
   * dev` and in the browser suite's build, as `__PSEUDO_LANGUAGE__` is,
   * false in every other build, which drops it. Compiled in by
   * vite.config.ts, and by vitest.config.ts for the component tests.
   */
  const __THROWS_ON_PURPOSE__: boolean;
}
