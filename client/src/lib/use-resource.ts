import { useCallback, useEffect, useState } from 'react';

import { api, isRevisionRefusal } from './api';
import { useFailureWords } from './use-failure-words';

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
 * own actions to write to, as they did before. A read's failure is worded
 * as the page renders (useFailureWords), so an outdated tab's says what is
 * true now, not when it came (ADR-081).
 *
 * `refused` is the first read refused for this tab's API revision, with
 * nothing yet to show: the page shows why in its place (RevisionRefusalPage)
 * rather than an error. A refused reload keeps the data and its banner.
 *
 * Responses wrapped in an object (`{ priceList }`) are unwrapped by the page,
 * not here: `data?.priceList` reads plainly, and a selector passed in would
 * need to be kept stable for the effect's sake.
 */
export function useResource<T>(path: string) {
  const [data, setData] = useState<T | null>(null);
  // A read's failure as it came, or the page's own words.
  const [shown, setShown] = useState<unknown>(null);
  // The read's failure itself, for a page to tell a missing record from a
  // refused one (LoadFailure, conventions.md "Status pages").
  const [failure, setFailure] = useState<unknown>(null);
  const error = useFailureWords(shown);

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
          setShown(caught);
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
      setShown(null);
      setFailure(null);
    } catch (caught) {
      setShown(caught);
      setFailure(caught);
    }
  }, [path]);

  const setError = useCallback(
    (message: string | null) => setShown(message),
    [],
  );

  return {
    data,
    error,
    failure,
    refused: data === null && isRevisionRefusal(failure) ? failure : null,
    setError,
    /** True until the first read has either answered or failed. */
    loading: data === null && error === null,
    reload,
  };
}
