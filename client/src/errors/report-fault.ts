import { ApiError } from '../lib/api';
import { firstScreenShown } from '../lib/loading-mark';
import { ChunkLoadError } from '../version/load-chunk';
import type { TrackerOptions } from './tracker';

/** What a report says beside the error: the reference the person sees. */
export interface FaultContext {
  reference?: string | null;
}

/** tracker.ts's, once its chunk has loaded. */
export interface Tracker {
  send: (error: unknown, context: FaultContext) => void;
}

/**
 * The most reports one page load sends (ADR-084), so one fault in a loop
 * cannot spend the month's 5,000.
 */
export const MAX_REPORTS = 10;

let tracker: Tracker | null = null;
/** Faults before the tracker has loaded; null once it would not. */
let held: [unknown, FaultContext][] | null = [];

/**
 * Reports a fault to the error tracker (ADR-084), where it ends: the error
 * boundary, the root's onUncaughtError, a language's or a Help guide's
 * chunk broken in this build. Before the tracker's chunk has loaded, it is
 * held, and sent once it has. What is not a fault is dropped here.
 */
export function reportFault(error: unknown, context: FaultContext = {}): void {
  if (!isFault(error)) return;
  if (tracker) tracker.send(error, context);
  else if (held && held.length < MAX_REPORTS) held.push([error, context]);
}

/**
 * Loads the tracker's chunk once the first screen has drawn (main.tsx),
 * then sends what was held. A chunk that will not load leaves reporting
 * off for this tab, and nothing else: no reload, no status page.
 * `options` is for the tests, which record instead of sending.
 *
 * Until then, an error or a rejection no code caught is held as the rest
 * are; from then, the tracker's own handlers hear them, and these listeners
 * are gone, so none is reported twice.
 */
export async function startReporting(options?: TrackerOptions): Promise<void> {
  window.addEventListener('error', heardError);
  window.addEventListener('unhandledrejection', heardRejection);
  try {
    await firstScreenShown;
    const { startTracker } = await import('./tracker');
    tracker = startTracker(options);
  } catch {
    held = null;
    return;
  } finally {
    window.removeEventListener('error', heardError);
    window.removeEventListener('unhandledrejection', heardRejection);
  }
  for (const [error, context] of held ?? []) tracker.send(error, context);
  held = [];
}

/** An error no code caught; one from another origin's script carries none. */
function heardError(event: ErrorEvent) {
  if (event.error) reportFault(event.error);
}

function heardRejection(event: PromiseRejectionEvent) {
  reportFault(event.reason);
}

/** fetch's TypeError for a dropped connection: Chrome's, Firefox's, Safari's. */
const DROPPED = new Set([
  'Failed to fetch',
  'NetworkError when attempting to fetch resource.',
  'Load failed',
]);

/**
 * A real fault, not the app working as designed (ADR-084). Never an
 * ApiError: the server reported its own 500s, and the rest are refusals.
 * Never a chunk that failed for the connection or a newer build, a dropped
 * connection, or a request cancelled by leaving the page: a person fixes
 * those by waiting or reloading.
 */
export function isFault(error: unknown): boolean {
  if (error instanceof ApiError) return false;
  if (error instanceof ChunkLoadError) return error.failure === 'broken';
  if (error instanceof TypeError && DROPPED.has(error.message)) return false;
  return (error as { name?: unknown } | null)?.name !== 'AbortError';
}
