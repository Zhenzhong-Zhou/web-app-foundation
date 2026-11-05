import { useEffect, useRef } from 'react';

/**
 * Reads again when the tab comes back into view after `awayMs` or more
 * out of it (ADR-091): Home's counts, beside Refresh, as most data
 * libraries do on a window's focus. A quick look at another tab asks
 * nothing; the latest `read` is the one called.
 */
export function useReadOnReturn(read: () => void, awayMs: number): void {
  const latest = useRef(read);
  useEffect(() => {
    latest.current = read;
  });

  useEffect(() => {
    let hiddenAt: number | null =
      document.visibilityState === 'hidden' ? Date.now() : null;
    function onVisibility() {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      if (hiddenAt !== null && Date.now() - hiddenAt >= awayMs) {
        latest.current();
      }
      hiddenAt = null;
    }
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, [awayMs]);
}
