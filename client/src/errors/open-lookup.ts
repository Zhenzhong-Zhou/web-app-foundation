/**
 * "Search everything" from a status page: opens the top bar's lookup, the
 * same as pressing `/` (ADR-056). An event, so a page need not reach into
 * the layout for it.
 */
export const OPEN_LOOKUP = 'app:open-lookup';

export function openLookup(): void {
  window.dispatchEvent(new Event(OPEN_LOOKUP));
}
