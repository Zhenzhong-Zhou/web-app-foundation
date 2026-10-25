import { useEffect } from 'react';

/**
 * index.html's loading mark (ADR-082), beside #root and over it until the
 * app's first screen is on view: a page, a status page (the new-version
 * page among them), or the start-up "Could not reach the server". Each of
 * those calls useScreenShown, so the first to draw takes the mark down and
 * the rest find it gone. Until then, what the app draws under it (a
 * spinner, the rail while a page's chunk loads) stays out of sight.
 */
const ID = 'loading-mark';

/** Whether the mark is still up, so a spinner of the app's waits under it. */
export function loadingMarkShown(): boolean {
  return document.getElementById(ID) !== null;
}

export function removeLoadingMark(): void {
  document.getElementById(ID)?.remove();
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
