/**
 * How many of the API's reads are on their way (ADR-091): the top loading
 * bar waits for a new screen's first read by it (#431). Reads only: a
 * write shows its own button's progress.
 */
let inFlight = 0;
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function readsInFlight(): number {
  return inFlight;
}

export function subscribeToReads(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Counts a read while it is on its way, its answer or failure unchanged. */
export function trackRead<T>(read: Promise<T>): Promise<T> {
  inFlight += 1;
  notify();
  return read.finally(() => {
    inFlight -= 1;
    notify();
  });
}
