import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

import { API_REVISION } from '../api/revision.gen';
import { useWhileVisible } from '../lib/use-while-visible';
import { BUILD } from './build';
import { reloadPage } from './reload-page';

/** What the server's version.json says beside this tab's own build. */
export interface NewVersion {
  /** The file names another build, not the dev server's. */
  newer: boolean;
  /**
   * And its saves would be refused: its API revision is above this tab's,
   * or the API has already refused this tab as outdated.
   */
  urgent: boolean;
  /**
   * The API refused this tab as outdated (`client_outdated`), and has not
   * served it since. While the file still names this tab's own build, the
   * new version is on its way: the API deploys first, and a reload would
   * load the same build.
   */
  outdated: boolean;
}

/** How a read of the file came out, for a caller that asked (ADR-081). */
export type VersionRead = 'unreadable' | 'same' | 'newer';

/** The file's shape, as vite.config.ts's version-file plugin writes it. */
interface VersionFile {
  build: string;
  apiRevision: number;
}

/** How often the file is read while the tab is in front. */
const EVERY_MS = 10 * 60_000;

/** How often while the new version is on its way, until it is out. */
const ON_ITS_WAY_EVERY_MS = 30_000;

/**
 * How long a read of the file may take: a refusal and a chunk that would
 * not load wait for it before anything shows, so one that hangs counts as
 * unreadable rather than holding them.
 */
const READ_TIMEOUT_MS = 5_000;

const NONE: NewVersion = { newer: false, urgent: false, outdated: false };

let known = NONE;
const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

const snapshot = () => known;

/** Whether a newer build is known, and whether it is urgent. */
export function useNewVersion(): NewVersion {
  return useSyncExternalStore(subscribe, snapshot);
}

/** The same, outside a component: what a refusal's words depend on. */
export const newVersionNow = snapshot;

/**
 * The newer build the file last named, and whether its API revision is
 * above this tab's; null while it names this tab's own build.
 */
let newer: { build: string; revisionAbove: boolean } | null = null;
/** The API refused this tab as outdated, and has not served it since. */
let outdated = false;

let onItsWayTimer: number | undefined;

/**
 * Tells the screens when what is known changes. While the new version is
 * on its way, the file is read again every 30 seconds until it is out; in
 * the background nothing is asked, and coming back to the front reads it
 * (useVersionReads), which carries on from there.
 */
function publish() {
  const next: NewVersion = {
    newer: newer !== null,
    urgent: newer !== null && (newer.revisionAbove || outdated),
    outdated,
  };
  if (
    next.newer !== known.newer ||
    next.urgent !== known.urgent ||
    next.outdated !== known.outdated
  ) {
    known = next;
    for (const listener of listeners) listener();
  }

  if (outdated && !newer) {
    onItsWayTimer ??= window.setTimeout(() => {
      onItsWayTimer = undefined;
      if (document.visibilityState === 'visible') void checkVersion();
    }, ON_ITS_WAY_EVERY_MS);
  } else {
    window.clearTimeout(onItsWayTimer);
    onItsWayTimer = undefined;
  }
}

/**
 * The API refused this tab as outdated (ADR-081), from `api()` and the
 * image upload: its saves are refused from now on, so a newer build is
 * urgent, and the file is read again at once to know whether one is out.
 * Resolves once it has been, so the refusal reaches the screen with it.
 * Once a newer build is known, a later refusal has nothing more to learn
 * from the file, and waits for nothing.
 */
export function noteOutdated(): Promise<VersionRead> {
  if (outdated && newer) return Promise.resolve('newer');
  if (!outdated) {
    outdated = true;
    publish();
  }
  return checkVersion();
}

/**
 * The API served this tab: its revision is the API's again, as after a
 * rollback took the API back to it.
 */
export function noteServed(): void {
  if (!outdated) return;
  outdated = false;
  publish();
}

let reading: Promise<VersionRead> | null = null;

/**
 * Reads version.json and compares it with this tab's build (ADR-081). One
 * read at a time: a caller arriving while one is out shares it. A read that
 * fails, or finds anything but the file's JSON, changes nothing and says
 * so to the caller.
 */
export function checkVersion(): Promise<VersionRead> {
  reading ??= read().finally(() => {
    reading = null;
  });
  return reading;
}

async function read(): Promise<VersionRead> {
  const found = await fetchFile();
  if (found) {
    newer =
      found.build !== BUILD.build && found.build !== 'dev'
        ? {
            build: found.build,
            revisionAbove: found.apiRevision > API_REVISION,
          }
        : null;
  }
  publish();
  if (!found) return 'unreadable';
  return newer ? 'newer' : 'same';
}

/**
 * The file, asked for past every cache. `no-store` keeps the browser's out
 * of it; Render's edge ignores that but not a query string it has not seen,
 * so each read has one of its own. The host answers a file it lacks with
 * index.html, which is not the file. Given up after five seconds, its body
 * included.
 */
async function fetchFile(): Promise<VersionFile | null> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), READ_TIMEOUT_MS);
  try {
    const response = await fetch(`/version.json?${Date.now()}`, {
      cache: 'no-store',
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const body: unknown = await response.json();
    return isVersionFile(body) ? body : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

function isVersionFile(value: unknown): value is VersionFile {
  if (typeof value !== 'object' || value === null) return false;
  const { build, apiRevision } = value as Record<string, unknown>;
  return (
    typeof build === 'string' &&
    build !== '' &&
    Number.isInteger(apiRevision) &&
    (apiRevision as number) > 0
  );
}

/**
 * Reads the file while the tab is in front (ADR-081): as it starts, every
 * ten minutes, and again the moment it comes back to the front. A hidden
 * tab asks nothing, as the bell's count does (ADR-063).
 */
export function useVersionReads(): void {
  useWhileVisible(checkVersion, EVERY_MS);
}

/** This tab's last load in full for a newer build, in sessionStorage. */
const LOADED_KEY = 'newVersionLoaded';

/**
 * Loads the page in full from the newer build the file last named, once
 * per build (ADR-081): not again for that build while this tab's last load
 * for it is younger than `againAfterMs`, for good unless a caller says
 * otherwise. A load that comes back still on this tab's build, as Render's
 * edge can serve the old index.html for five minutes, then stays as it is
 * rather than loading again and again. Kept in sessionStorage, which
 * outlives the load; where storage is refused, nothing loads by itself,
 * since nothing would stop it repeating. Whether it did.
 */
export function loadNewerOnce(againAfterMs = Infinity): boolean {
  const build = newer?.build;
  if (!build) return false;
  try {
    const last = JSON.parse(sessionStorage.getItem(LOADED_KEY) ?? 'null') as {
      build: string;
      at: number;
    } | null;
    if (last?.build === build && Date.now() - last.at < againAfterMs) {
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
 * Once a newer build is known, the next page opened loads in full from it
 * (ADR-081), never the one someone is typing in. Opening another page means
 * its path changing: a tab or a filter kept in the address does not count.
 *
 * From an effect once the new page has rendered, not a second blocker, so
 * the unsaved-changes prompt has already run, and the old page has gone
 * with its own "Leave site?" listener: the browser's never follows the
 * app's.
 *
 * Once per newer build: if the load comes back on the old build, later
 * pages load nothing more for it, and New version, or the amber banner,
 * stays for the person to use.
 */
export function useReloadAtNextPage(): void {
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (known.newer) loadNewerOnce();
  }, [pathname]);
}

/**
 * The version check's reads, and the load in full at the next page, signed
 * in or out (ADR-081). A leaf of its own beside the app, drawing nothing:
 * the next page needs the location, and only this re-renders when it
 * changes, not the app and every route under it.
 */
export function VersionWatch(): null {
  useVersionReads();
  useReloadAtNextPage();
  return null;
}
