import { useCallback, useEffect, useState } from 'react';

import { api, messageFor } from './api';

/** What every keyset endpoint returns (ADR-022). */
export type KeysetPage<T> = { entries: T[]; nextCursor: string | null };

type Read<T> = {
  /** Which list these rows belong to, and which reload of it. */
  path: string | null;
  reloads: number;
  entries: T[] | null;
  cursor: string | null;
  error: string | null;
};

const NOTHING_READ = {
  path: null,
  reloads: 0,
  entries: null,
  cursor: null,
  error: null,
} as const;

/** `before` added to a path that may already carry a query. */
function withBefore(path: string, cursor: string): string {
  const [base, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  params.set('before', cursor);
  return `${base}?${params.toString()}`;
}

/**
 * A list read a page at a time, newest first, with Load more.
 *
 * `path` is the first page, filters included. Changing it starts a new list:
 * the rows, cursor and error of the old one are dropped at once, so the old
 * filter's rows never sit under the new filter's label. `null` reads nothing,
 * for a list the caller may not see.
 *
 * Pages are appended, never refetched from the top. That is the point of a
 * keyset cursor: rows already on screen stay put, and a record arriving
 * mid-scroll cannot shift the page the way an offset does.
 *
 * Whether there is more comes from the server's cursor, which it sets by
 * reading one row past the limit. Inferring it from a full page is wrong
 * exactly once, on a last page that happens to be full, and the symptom is a
 * Load more that returns nothing.
 *
 * Extracted from eight lists that had drifted apart. It settles each
 * difference one way:
 *
 * - A successful read clears the error, Load more included, so a retry that
 *   works takes the banner with it.
 * - A new filter starts with no error, as orders and movements already did.
 * - A page that answers after the list has changed is dropped. None of the
 *   eight guarded Load more, so a filter changed mid-request had the previous
 *   filter's rows appended to the new list.
 * - The cursor is URL-encoded. Movements put it into the query as it came,
 *   which only works while cursors are row ids with nothing to escape.
 *
 * The rows are stored with the path and reload they were read for. A
 * different path shows nothing, which is how a new filter clears the list
 * without an effect setting state. A reload of the same path keeps the rows
 * up until the new first page lands, as production orders did after planning
 * a run: blanking a list to a skeleton to show one more row is worse.
 * Either way, a late answer can tell it is late.
 */
export function useKeysetList<T>(path: string | null) {
  const [reloads, setReloads] = useState(0);
  const [read, setRead] = useState<Read<T>>(NOTHING_READ);
  const [loadingMore, setLoadingMore] = useState(false);

  const samePath = read.path === path;
  const fresh = samePath && read.reloads === reloads;

  // A reload in flight shows the rows it will replace, but not their cursor:
  // a page read after the old head would be appended to the new one.
  const current: Read<T> = fresh
    ? read
    : samePath
      ? { ...read, cursor: null }
      : { ...NOTHING_READ, path, reloads };

  useEffect(() => {
    if (path === null) return;

    let ignore = false;

    void api<KeysetPage<T>>(path)
      .then((page) => {
        if (ignore) return;
        setRead({
          path,
          reloads,
          entries: page.entries,
          cursor: page.nextCursor,
          error: null,
        });
      })
      .catch((caught: unknown) => {
        if (ignore) return;
        setRead({ ...NOTHING_READ, path, reloads, error: messageFor(caught) });
      });

    return () => {
      ignore = true;
    };
  }, [path, reloads]);

  const { cursor } = current;

  const loadMore = useCallback(async () => {
    if (path === null || cursor === null) return;

    // Whether an answer still belongs: the list it was asked for is the one
    // on screen, not a newer filter or a reload that has replaced it.
    const stillCurrent = (latest: Read<T>) =>
      latest.path === path && latest.reloads === reloads;

    setLoadingMore(true);

    try {
      const page = await api<KeysetPage<T>>(withBefore(path, cursor));

      setRead((latest) =>
        stillCurrent(latest)
          ? {
              ...latest,
              entries: [...(latest.entries ?? []), ...page.entries],
              cursor: page.nextCursor,
              error: null,
            }
          : latest,
      );
    } catch (caught) {
      setRead((latest) =>
        stillCurrent(latest)
          ? { ...latest, error: messageFor(caught) }
          : latest,
      );
    } finally {
      setLoadingMore(false);
    }
  }, [path, reloads, cursor]);

  /**
   * Reads the first page again after a write that adds a row, keeping the
   * rows shown until it lands. A counter rather than a flag, because asking
   * twice must read twice — and because setting a filter to the value it
   * already has does nothing, which once left a list on its skeleton.
   */
  const reload = useCallback(() => setReloads((count) => count + 1), []);

  return {
    entries: current.entries,
    error: current.error,
    /** True until the first page has either answered or failed. */
    loading: current.entries === null && current.error === null,
    hasMore: current.cursor !== null,
    loadingMore,
    loadMore,
    reload,
  };
}
