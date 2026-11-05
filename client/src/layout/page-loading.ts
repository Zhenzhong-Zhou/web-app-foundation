/**
 * The screen the router has moved to, for the top loading bar (ADR-091,
 * #431). On a tap the router changes its location at once, while React
 * keeps the screen it has until the next one's code is in, inside a
 * transition, so the frame's own location still names the old one: the
 * two differing is a screen loading. The router's `navigation` state
 * cannot say it, since no route here has a loader: it stays idle.
 */
interface Watched {
  state: { location: { pathname: string } };
  subscribe(
    listener: (state: { location: { pathname: string } }) => void,
  ): () => void;
}

let requested: string | null = null;
const listeners = new Set<() => void>();

/** Follows the app's router, from main.tsx. */
export function watchNavigations(router: Watched): () => void {
  requested = router.state.location.pathname;
  return router.subscribe((state) => {
    if (state.location.pathname === requested) return;
    requested = state.location.pathname;
    for (const listener of listeners) listener();
  });
}

/** The path the router is on, or null with no router watched (a test's). */
export function requestedPath(): string | null {
  return requested;
}

export function subscribeToNavigations(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
