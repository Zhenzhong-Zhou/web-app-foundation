import { useEffect } from 'react';

/**
 * index.html's loading mark (ADR-082), beside #root and over it until the
 * app's first screen is on view: a page, a status page (the new-version
 * page among them), or a screen before sign-in, SignedOutFrame's (the
 * start-up Can't reach the server among them). Each of those calls
 * useScreenShown, so the first to draw takes the mark down and the rest
 * find it gone. Until then, what the app draws under it (a
 * spinner, the rail while a page's chunk loads) stays out of sight, and
 * out of screen readers' reach too: index.html hides #root from them
 * while the mark is up, and taking the mark down shows it.
 */
const ID = 'loading-mark';

export function removeLoadingMark(): void {
  document.getElementById(ID)?.remove();
  document.getElementById('root')?.removeAttribute('aria-hidden');
}

/** Takes the loading mark down once this screen is on view. */
export function useScreenShown(): void {
  useEffect(removeLoadingMark, []);
}

/** The same, where a screen is put together in JSX rather than its own component. */
export function ScreenShown(): null {
  useScreenShown();
  return null;
}
