import { useEffect, useState } from 'react';

/**
 * True only once `active` has been true for `delayMs`.
 *
 * A response that arrives in 80ms should never flash a spinner — the flash
 * reads as jank, while no indicator at all reads as instant. But a cold start
 * on a spun-down free instance takes about a minute (see smoke-auth.sh), and a
 * blank page for that long reads as broken.
 *
 * One-shot by design: once elapsed, a later `active` shows the indicator
 * immediately. That suits the boot check. A screen that loads repeatedly wants
 * a key or a reset.
 */
export function useDelayedFlag(active: boolean, delayMs = 250): boolean {
  const [elapsed, setElapsed] = useState(false);

  useEffect(() => {
    if (!active) return;
    const timer = setTimeout(() => setElapsed(true), delayMs);
    return () => clearTimeout(timer);
  }, [active, delayMs]);

  return active && elapsed;
}
