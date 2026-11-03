import { useEffect, useState } from 'react';

import { api } from './api';
import { SEARCH_WAIT_MS } from './use-list-search';

/** What a screen asks: a path, and a body when it asks by POST. */
export interface Question {
  path: string;
  body?: string;
}

/**
 * An answer, with the question it answers: `value` when the read worked,
 * else null and `failure`, what the read threw.
 */
export interface Answer<Q extends Question, T> {
  question: Q;
  value: T | null;
  failure: unknown;
}

/**
 * A read asked once typing pauses, as a search is (#355): the ship and
 * credit dialogs' previews, the reorder point's Today and Plan a run's
 * Uses, one copy of it.
 *
 * It asks `question` a moment after it last changed, and nothing while it
 * is null. It keeps the last answer, with the question it answers, so the
 * screen tells whether it answers what is entered now; an answer that
 * comes after a newer question is dropped. A question may carry beside its
 * path what the screen shows with its answer, as Today's point.
 */
export function useDebouncedRead<T, Q extends Question = Question>(
  question: Q | null,
): Answer<Q, T> | null {
  const [answer, setAnswer] = useState<Answer<Q, T> | null>(null);
  // One string, so it asks again when the question changes, not on every
  // render.
  const asked = question && JSON.stringify(question);

  useEffect(() => {
    if (!asked) return;
    const asking = JSON.parse(asked) as Q;

    let ignore = false;
    const timer = setTimeout(() => {
      void api<T>(
        asking.path,
        asking.body === undefined ? {} : { method: 'POST', body: asking.body },
      )
        .then((value) => {
          if (!ignore) setAnswer({ question: asking, value, failure: null });
        })
        .catch((failure: unknown) => {
          if (!ignore) setAnswer({ question: asking, value: null, failure });
        });
    }, SEARCH_WAIT_MS);

    return () => {
      ignore = true;
      clearTimeout(timer);
    };
  }, [asked]);

  return answer;
}
