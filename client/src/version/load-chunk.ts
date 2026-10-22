import { checkVersion, loadNewerOnce, type VersionRead } from './version-check';

/**
 * Why a chunk would not load, once tried twice and the version file read
 * (ADR-081): the connection, a newer build, or a real failure in this one.
 */
export type ChunkFailure = 'offline' | 'newer' | 'broken';

const FAILURE: Record<VersionRead, ChunkFailure> = {
  unreadable: 'offline',
  newer: 'newer',
  same: 'broken',
};

/**
 * A chunk that would not load, and why. Screens decide from `failure`,
 * never from the browser's words, which say the same for a dropped
 * connection and a deploy.
 */
export class ChunkLoadError extends Error {
  readonly failure: ChunkFailure;

  constructor(failure: ChunkFailure, cause: unknown) {
    super(`A chunk did not load (${failure})`, { cause });
    this.name = 'ChunkLoadError';
    this.failure = failure;
  }
}

/** How long a failed chunk waits before its second try. */
const RETRY_AFTER_MS = 1000;

/**
 * One way every chunk loads (ADR-081): a page, a catalogue or a Help
 * guide. A failure waits a second and tries once more; then the version
 * file says why. Unreadable, the connection dropped; a newer build, a
 * deploy came out while the tab was open; this build, a real failure.
 *
 * A failed preload reaches here as its import's rejection. Nothing listens
 * for `vite:preloadError`: a listener that prevented its default would
 * make the import resolve to nothing instead.
 *
 * The second try is a real one where the browser fetches again: Chrome
 * and Firefox do, for a module and for the modules it imports; Safari only
 * for the module itself, and keeps a failure among its imports until the
 * page loads in full, so there a page's second try fails the same way and
 * the version file decides as before.
 */
export async function loadChunk<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await load();
  } catch {
    await new Promise((resolve) => setTimeout(resolve, RETRY_AFTER_MS));
  }
  try {
    return await load();
  } catch (caught) {
    throw new ChunkLoadError(FAILURE[await checkVersion()], caught);
  }
}

/**
 * How long a page's load in full for one build stops another for it: a
 * load that brings the same failure back then says so, rather than
 * loading again and again.
 */
const AGAIN_AFTER_MS = 60_000;

/**
 * A page's chunk (lazyNamed), or a language's (loadMessages). When a newer
 * build is why it failed, the page being opened loads in full from it,
 * once a minute at most for that build, and the route or the language
 * keeps its loading state until the browser has; otherwise the failure
 * goes to its caller: the error boundary, which shows the status page for
 * it, or the language provider, which says so.
 */
export async function loadChunkOrReload<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await loadChunk(load);
  } catch (error) {
    if (
      error instanceof ChunkLoadError &&
      error.failure === 'newer' &&
      loadNewerOnce(AGAIN_AFTER_MS)
    ) {
      return new Promise<never>(() => undefined);
    }
    throw error;
  }
}
