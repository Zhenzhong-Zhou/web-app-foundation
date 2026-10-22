import { reloadPage } from './reload-page';
import { checkVersion, newerBuild, type VersionRead } from './version-check';

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

/** This tab's last load in full for a newer build, in sessionStorage. */
const LOADED_KEY = 'newVersionLoaded';

/** How long a load in full for one build stops another for it. */
const ONCE_WITHIN_MS = 60_000;

/**
 * Loads the page in full from the newer build the file named, unless this
 * tab already did so for that build within a minute: a load that brings
 * the same failure back then says so, rather than loading again and
 * again. Kept in sessionStorage, which outlives the load; where storage is
 * refused, nothing loads, since nothing would stop a loop. Whether it did.
 */
export function loadNewerOnce(): boolean {
  const build = newerBuild();
  if (!build) return false;
  try {
    const last = JSON.parse(sessionStorage.getItem(LOADED_KEY) ?? 'null') as {
      build: string;
      at: number;
    } | null;
    if (last?.build === build && Date.now() - last.at < ONCE_WITHIN_MS) {
      return false;
    }
    sessionStorage.setItem(
      LOADED_KEY,
      JSON.stringify({ build, at: Date.now() }),
    );
  } catch {
    return false;
  }
  reloadPage();
  return true;
}

/**
 * A page's chunk (lazyNamed). When a newer build is why it failed, the
 * page being opened loads in full from it, and the route keeps its
 * loading state until the browser has; otherwise the failure goes to the
 * error boundary, which shows the status page for it.
 */
export async function loadPage<T>(load: () => Promise<T>): Promise<T> {
  try {
    return await loadChunk(load);
  } catch (error) {
    if (
      error instanceof ChunkLoadError &&
      error.failure === 'newer' &&
      loadNewerOnce()
    ) {
      return new Promise<never>(() => undefined);
    }
    throw error;
  }
}
