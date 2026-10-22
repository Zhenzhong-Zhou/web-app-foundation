/**
 * The build this tab runs (ADR-081), compiled in by vite.config.ts's
 * version-file plugin, and by vitest.config.ts for the component tests.
 */
export interface Build {
  /** The commit it was built from; `dev` on the dev server. */
  build: string;
  /** When it was built, as an ISO instant. */
  builtAt: string;
  /** The release, as package.json names it. */
  version: string;
}

declare const __BUILD__: Build;

export const BUILD: Build = __BUILD__;
