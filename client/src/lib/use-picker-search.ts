import { useEffect, useState } from 'react';

import { api } from './api';
import { withSearch } from './use-list-search';

/** As a list waits for typing to stop (useListSearch). */
const WAIT_MS = 300;

/**
 * A picker's search on the server (ADR-056, amended): the item pickers'
 * and the partner pickers', one copy of it.
 *
 * Until something is typed, it lists `options`, as the form offers them.
 * From the first character, as a list does, it asks `path` with `search` a
 * moment after typing stops, and lists the answer in the server's order,
 * matching nothing itself. The answer is kept to `options`, so what a form
 * leaves out (a variant already on the order, a retired partner) stays out,
 * and every row is one the form knows. An answer that comes after a newer
 * search is dropped.
 */
export function usePickerSearch<T extends { id: string }>(
  path: string,
  options: T[],
): {
  /** What the picker lists; empty while it asks. */
  shown: T[];
  /** Asking, or waiting for typing to stop: the picker says it is loading. */
  asking: boolean;
  /** The last search failed, rather than found nothing. */
  failed: boolean;
  /**
   * Autocomplete's `onInputChange`. Only what is typed is a search, not the
   * label MUI writes back on a choice or a blur.
   */
  onInputChange: (event: unknown, text: string, reason: string) => void;
} {
  const [typed, setTyped] = useState('');
  const search = typed.trim();
  // The last answer, with the search it answers; null ids for a failure.
  const [found, setFound] = useState<{
    search: string;
    ids: string[] | null;
  } | null>(null);

  useEffect(() => {
    if (!search) return;

    let ignore = false;
    const timer = setTimeout(() => {
      void api<T[]>(withSearch(path, search))
        .then((rows) => {
          if (!ignore) setFound({ search, ids: rows.map((row) => row.id) });
        })
        .catch(() => {
          if (!ignore) setFound({ search, ids: null });
        });
    }, WAIT_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [path, search]);

  const answer = search && found?.search === search ? found : null;
  const offered = new Map(options.map((option) => [option.id, option]));

  return {
    shown: !search
      ? options
      : (answer?.ids ?? []).flatMap((id) => offered.get(id) ?? []),
    asking: search !== '' && answer === null,
    failed: answer?.ids === null,
    onInputChange: (_event, text, reason) =>
      setTyped(reason === 'input' ? text : ''),
  };
}
