import { useEffect, useRef, useSyncExternalStore } from 'react';
import { useLocation } from 'react-router-dom';

import { API_REVISION } from '../api/revision.gen';
import { BUILD } from './build';
import { reloadPage } from './reload-page';

/** What the server's version.json says beside this tab's own build. */
export interface NewVersion {
  /** The file names another build, not the dev server's. */
  newer: boolean;
  /** And its API revision is above this tab's: its saves would be refused. */
  urgent: boolean;
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

const NONE: NewVersion = { newer: false, urgent: false };

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

/** The build the file last named, when newer than this tab's. */
let newest: string | null = null;

/** The newer build a load in full would bring, as last read. */
export function newerBuild(): string | null {
  return newest;
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
  const file = await fetchFile();
  if (!file) return 'unreadable';

  const newer = file.build !== BUILD.build && file.build !== 'dev';
  const urgent = newer && file.apiRevision > API_REVISION;
  newest = newer ? file.build : null;
  if (newer !== known.newer || urgent !== known.urgent) {
    known = { newer, urgent };
    for (const listener of listeners) listener();
  }
  return newer ? 'newer' : 'same';
}

/**
 * The file, asked for past every cache. `no-store` keeps the browser's out
 * of it; Render's edge ignores that but not a query string it has not seen,
 * so each read has one of its own. The host answers a file it lacks with
 * index.html, which is not the file.
 */
async function fetchFile(): Promise<VersionFile | null> {
  try {
    const response = await fetch(`/version.json?${Date.now()}`, {
      cache: 'no-store',
    });
    if (!response.ok) return null;
    const file: unknown = await response.json();
    return isVersionFile(file) ? file : null;
  } catch {
    return null;
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
  useEffect(() => {
    let timer: number | undefined;
    function start() {
      void checkVersion();
      timer = window.setInterval(() => void checkVersion(), EVERY_MS);
    }
    function stop() {
      window.clearInterval(timer);
      timer = undefined;
    }
    function onVisibility() {
      if (document.visibilityState === 'visible') {
        if (timer === undefined) start();
      } else {
        stop();
      }
    }

    if (document.visibilityState === 'visible') start();
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      stop();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);
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
 */
export function useReloadAtNextPage(): void {
  const { pathname } = useLocation();
  const shown = useRef(pathname);

  useEffect(() => {
    if (shown.current === pathname) return;
    shown.current = pathname;
    if (known.newer) reloadPage();
  }, [pathname]);
}
