import { useEffect, useRef } from 'react';

/**
 * Calls `tick` every `everyMs` while the tab is in front, and at once each
 * time it comes back to the front: a hidden tab asks nothing (ADR-063), and
 * one looked at again is up to date when looked at. At once as it starts
 * too, unless `atStart` is false, for a caller that has only just asked.
 * Null asks nothing, until it is a function again.
 *
 * The bell's count, the version file's reads and a page waiting for a new
 * version to be installed all ask this way. The latest `tick` is the one
 * called, so a function made anew on each render restarts nothing.
 */
export function useWhileVisible(
  tick: (() => unknown) | null,
  everyMs: number,
  atStart = true,
): void {
  const latest = useRef(tick);
  useEffect(() => {
    latest.current = tick;
  });

  const asking = tick !== null;

  useEffect(() => {
    if (!asking) return;

    const call = () => void latest.current?.();
    let timer: number | undefined;
    function start(now: boolean) {
      if (now) call();
      timer = window.setInterval(call, everyMs);
    }
    function stop() {
      window.clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (timer === undefined) start(true);
      } else {
        stop();
      }
    }

    if (document.visibilityState === 'visible') start(atStart);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [asking, everyMs, atStart]);
}
