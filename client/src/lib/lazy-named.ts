import { type ComponentType, lazy } from 'react';

import { loadPage } from '../version/load-chunk';

/**
 * lazy() for a named export.
 *
 * React's lazy() resolves to `{ default }`, so every split route otherwise
 * carries a four-line `.then` shim. This is that shim, once.
 *
 * `name` is constrained to a key of the imported module, so a renamed
 * component fails to compile here rather than resolving to undefined and
 * rendering nothing at the route — which is the failure mode of the untyped
 * version, and one that looks like a routing bug.
 *
 * The import must stay an inline arrow: the bundler reads the literal path to
 * decide what to split, so a loader passed through a variable silently ends up
 * in the main chunk.
 *
 * It loads through loadPage (ADR-081): tried again after a second, then
 * the version file says why it failed.
 */
export function lazyNamed<
  M extends Record<string, ComponentType>,
  K extends keyof M & string,
>(load: () => Promise<M>, name: K) {
  return lazy(() =>
    loadPage(load).then((module) => ({ default: module[name] })),
  );
}
