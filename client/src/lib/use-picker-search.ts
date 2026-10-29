import { useEffect, useState } from 'react';
import { useIntl } from 'react-intl';

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
 *
 * `autocomplete` is the search's part of Autocomplete's props, for the
 * picker to spread: the rows as answered, what is typed, and while the
 * options load (`loading`) or it asks, that it is loading, in the popup's
 * status, which a screen reader hears; `noMatches` or `failed` only from
 * an answer. `C` is what the picker lists, where it adds a row of its
 * own to `T`, as Plan run's "We make it ourselves".
 */
export function usePickerSearch<T extends { id: string }, C = T>(
  path: string,
  options: T[],
  {
    loading,
    noMatches,
    failed,
  }: {
    /** The form's options have not come back yet. */
    loading: boolean;
    /** Said for an answer that found nothing. */
    noMatches: string;
    /** Said for a search that failed. */
    failed: string;
  },
): {
  /** What the picker lists; empty while it asks. */
  shown: T[];
  /** Loading, asking, or waiting for typing to stop: nothing to list yet. */
  waiting: boolean;
  autocomplete: {
    /** The rows as given: the server has matched and ordered them. */
    filterOptions: (choices: C[]) => C[];
    /**
     * Only what is typed is a search, not the label MUI writes back on a
     * choice or a blur.
     */
    onInputChange: (event: unknown, text: string, reason: string) => void;
    loading: boolean;
    loadingText: string;
    noOptionsText: string;
  };
} {
  const intl = useIntl();
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
  const waiting = loading || (search !== '' && answer === null);

  return {
    shown: !search
      ? options
      : (answer?.ids ?? []).flatMap((id) => offered.get(id) ?? []),
    waiting,
    autocomplete: {
      filterOptions: (choices) => choices,
      onInputChange: (_event, text, reason) =>
        setTyped(reason === 'input' ? text : ''),
      loading: waiting,
      loadingText: intl.formatMessage({
        id: 'common.loading',
        defaultMessage: 'Loading…',
      }),
      noOptionsText: answer?.ids === null ? failed : noMatches,
    },
  };
}
