import { useCallback, useEffect, useState } from 'react';

import { api, messageFor } from './api';

/**
 * One GET: read when the page opens and again whenever `path` changes, with
 * a `reload` for a Refresh button and for after a write.
 *
 * Extracted after the same pair appeared in a dozen pages: an effect with an
 * `ignore` flag for the first read, and a `load` callback repeating the same
 * request for every read after it. Two copies of one request drift, and one
 * pair of them already had. Several `load`s let a failure escape as an
 * unhandled rejection while the effect beside them caught it.
 *
 * The two reads differ on purpose, as they did in every page:
 *
 * - The first read ignores a response that arrives after the path has
 *   changed or the page has gone, so a slow answer for the previous record
 *   cannot overwrite the current one.
 * - A reload clears the error when it succeeds, which is what makes Refresh
 *   a retry. The first read does not need to: nothing has failed yet.
 *
 * A failed reload keeps the data already shown and sets the error beside it.
 * Stale figures with a banner saying so beat an empty page.
 *
 * `error` is the page's one banner, so `setError` is returned for the page's
 * own actions to write to, as they did before.
 *
 * Responses wrapped in an object (`{ priceList }`) are unwrapped by the page,
 * not here: `data?.priceList` reads plainly, and a selector passed in would
 * need to be kept stable for the effect's sake.
 */
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  // The error itself, for a page to tell a missing record from a refused
  // one (LoadFailure, conventions.md "Status pages").
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    let ignore = false;

    void api<T>(path)
      .then((response) => {
        if (!ignore) {
          setData(response);
          setFailure(null);
        }
      })
      .catch((caught: unknown) => {
        if (!ignore) {
          setError(messageFor(caught));
          setFailure(caught);
        }
      });

    return () => {
      ignore = true;
    };
  }, [path]);

  const reload = useCallback(async () => {
    try {
      setData(await api<T>(path));
      setError(null);
      setFailure(null);
    } catch (caught) {
      setError(messageFor(caught));
      setFailure(caught);
    }
  }, [path]);

  return {
    data,
    error,
    failure,
    setError,
    /** True until the first read has either answered or failed. */
    loading: data === null && error === null,
    reload,
  };
}
